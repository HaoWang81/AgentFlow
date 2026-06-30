import cron from 'node-cron'
import { getDb } from './database'
import { executeAgent } from './agent_runner'

class Scheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map()

  /**
   * Parse the front-end cron_config into a standard cron expression
   */
  private parseCronConfig(configStr: string): string | null {
    try {
      const config = JSON.parse(configStr)
      if (!config || !config.type) return null

      switch (config.type) {
        case 'interval':
          // e.g. every X minutes
          if (config.unit === 'minutes') return `*/${config.value} * * * *`
          if (config.unit === 'hours') return `0 */${config.value} * * *`
          break
        case 'daily':
          // e.g. daily at 08:30
          if (config.time) {
            const [hour, minute] = config.time.split(':')
            return `${minute} ${hour} * * *`
          }
          break
        case 'cron':
          return config.expression
      }
    } catch (e) {
      console.error('Error parsing cron config:', e)
    }
    return null
  }

  /**
   * Initializes the scheduler by loading all enabled agents
   */
  async init() {
    try {
      const db = await getDb()
      const agents = await db.all('SELECT * FROM agents WHERE cron_enabled = 1')
      console.log(`[Scheduler] Found ${agents.length} scheduled agents`)

      for (const agent of agents) {
        this.scheduleAgent(agent)
      }
    } catch (error) {
      console.error('[Scheduler] Initialization failed:', error)
    }
  }

  /**
   * Schedule or reschedule an agent
   */
  scheduleAgent(agent: any) {
    this.unscheduleAgent(agent.id.toString())

    if (agent.cron_enabled !== 1) return

    const expression = this.parseCronConfig(agent.cron_config)
    if (!expression || !cron.validate(expression)) {
      console.warn(`[Scheduler] Invalid cron expression for agent ${agent.id}: ${expression}`)
      return
    }

    console.log(`[Scheduler] Scheduling agent ${agent.id} with expression: ${expression}`)

    const task = cron.schedule(expression, () => {
      this.runAgent(agent)
    })

    this.jobs.set(agent.id.toString(), task)
  }

  /**
   * Unschedule an agent
   */
  unscheduleAgent(agentId: string) {
    const existingJob = this.jobs.get(agentId)
    if (existingJob) {
      console.log(`[Scheduler] Unscheduling agent ${agentId}`)
      existingJob.stop()
      this.jobs.delete(agentId)
    }
  }

  /**
   * Run the agent in the background and log to agent_runs
   */
  private async runAgent(agent: any) {
    const agentId = agent.id
    let prompt = '系统定时触发任务'
    try {
      const config = typeof agent.cron_config === 'string' ? JSON.parse(agent.cron_config) : agent.cron_config
      if (config && config.prompt) prompt = config.prompt
    } catch (e) {}

    console.log(`[Scheduler] Executing agent ${agentId} with prompt: ${prompt}`)
    const db = await getDb()

    // Create a running record
    const runResult = await db.run(
      `INSERT INTO agent_runs (agent_id, trigger_type, status, input_params) VALUES (?, 'cron', 'running', ?)`,
      [agentId, prompt]
    )
    const runId = runResult.lastID

    try {
      let finalResult = ''
      const artifacts: any[] = []
      await executeAgent(
        agentId.toString(),
        [{ role: 'user', content: prompt }],
        db,
        {
          onEvent: (type, payload) => {
            if (type === 'TEXT_MESSAGE_CONTENT' && payload?.delta) {
              finalResult += payload.delta
            } else if (type === 'FILE_ARTIFACT' && payload) {
              artifacts.push(payload)
            }
          }
        }
      )

      await db.run(
        `UPDATE agent_runs SET status = 'success', result = ?, artifacts = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [finalResult, JSON.stringify(artifacts), runId]
      )
      console.log(`[Scheduler] Agent ${agentId} execution finished successfully`)
    } catch (error: any) {
      console.error(`[Scheduler] Agent ${agentId} execution failed:`, error)
      await db.run(
        `UPDATE agent_runs SET status = 'error', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [error.message || String(error), runId]
      )
    }
  }
}

export const agentScheduler = new Scheduler()
