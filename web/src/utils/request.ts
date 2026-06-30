import axios from 'axios'

// In production Electron, we need to use absolute URL since we are on file:// protocol
const baseURL = import.meta.env.DEV ? (import.meta.env.VITE_API_BASE_URL || '') : 'http://127.0.0.1:8001'

const request = axios.create({
  baseURL,
  timeout: 120000, // 增加到 120 秒，因为大模型真实推理耗时较长
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 (可以在这里统一加 Token、请求上下文前缀等)
request.interceptors.request.use(
  (config) => {
    // 例如：增加上下文前缀 /v1 或者是通过 VITE_API_PREFIX
    // config.url = (import.meta.env.VITE_API_PREFIX || '') + config.url
    
    // 例如：添加身份验证头
    // const token = localStorage.getItem('token')
    // if (token) {
    //   config.headers['Authorization'] = `Bearer ${token}`
    // }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 (可以在这里统一处理 401 登出、服务器报错提示等)
request.interceptors.response.use(
  (response) => {
    // 我们的现有代码期望得到完整的 axios response 对象（包含 .data）
    return response
  },
  (error) => {
    console.error('API Error:', error.response?.status, error.message)
    // 可以在这里接入 Message 弹窗提示组件统一拦截报错
    return Promise.reject(error)
  }
)

export default request
