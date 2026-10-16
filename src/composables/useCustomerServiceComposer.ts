import { useCustomerServiceStore } from '@/stores/customerService'

export function useCustomerServiceComposer() {
  const support = useCustomerServiceStore()
  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
      return
    event.preventDefault()
    support.sendText()
  }
  return { handleKeydown }
}
