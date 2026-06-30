import { createVNode, render } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

export const Confirm = (title: string, message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    
    const close = () => {
      render(null, container)
      container.remove()
    }
    
    const vnode = createVNode(ConfirmDialog, {
      title,
      message,
      onConfirm: () => { resolve(true); close() },
      onCancel: () => { resolve(false); close() }
    })
    
    render(vnode, container)
  })
}
