import { createRouter, createWebHashHistory } from 'vue-router'
import Portal from '../views/Portal.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Portal },
    { 
      path: '/console', 
      component: () => import('../layouts/ConsoleLayout.vue'),
      redirect: '/console/workflows',
      children: [
        { path: 'workflows', component: () => import('../views/WorkflowList.vue') },
        { path: 'agents', component: () => import('../views/AgentList.vue') },
        { path: 'agents/:id/config', component: () => import('../views/AgentConfig.vue') },
        { path: 'knowledge-bases/:id', component: () => import('../views/KnowledgeBaseDetail.vue') },
        { path: 'resources', component: () => import('../views/ResourceCenter.vue') }
      ]
    },
    // The editor is full screen, so it sits outside the console layout
    { path: '/console/workflows/:id/editor', component: () => import('../views/Editor.vue'), props: true },
    // Immersive run page for agents
    { path: '/run/:id', component: () => import('../views/AgentRun.vue') }
  ]
})

export default router
