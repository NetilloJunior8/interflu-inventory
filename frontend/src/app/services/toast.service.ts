import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<ToastMessage[]>([]);

  show(text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3800) {
    const id = this.nextId++;
    this.toasts.update(list => [...list, { id, text, type }]);
    setTimeout(() => {
      this.toasts.update(list => list.filter(t => t.id !== id));
    }, duration);
  }

  info(text: string)    { this.show(text, 'info'); }
  success(text: string) { this.show(text, 'success'); }
  warning(text: string) { this.show(text, 'warning', 5000); }
  error(text: string)   { this.show(text, 'error', 5000); }
}
