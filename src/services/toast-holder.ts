export interface ToastInput {
  variant?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message: string
  duration?: number
}

type ToastFunction = (input: ToastInput) => void

let _toast: ToastFunction | null = null

export function setGlobalToast(toast: ToastFunction): void {
  _toast = toast
}

export function getGlobalToast(): ToastFunction | null {
  return _toast
}

export function showToast(message: string, variant: ToastInput['variant'] = 'error', title?: string): void {
  if (_toast) {
    _toast({ variant, title: title ?? 'AE', message, duration: 5000 })
  }
}
