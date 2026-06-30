import { createVNode, render } from 'vue'
import MessageComponent from '../components/Message.vue'

export const Message = {
  success(text: string) { show(text, 'success') },
  error(text: string) { show(text, 'error') },
  warning(text: string) { show(text, 'warning') },
  info(text: string) { show(text, 'info') }
}

function show(text: string, type: 'success' | 'error' | 'warning' | 'info') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  
  const vnode = createVNode(MessageComponent, { 
    text, 
    type,
    onClose: () => {
      render(null, container)
      container.remove()
    }
  })
  
  render(vnode, container)
}
