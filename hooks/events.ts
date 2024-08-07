export type EventHandler<T> = (event: T) => void;

export class EventListener<T> {
  private listeners: EventHandler<T>[] = [];

  addEventListener(listener: EventHandler<T>) {
    this.listeners.push(listener);
  }

  removeEventListener(listener: EventHandler<T>) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  notify(event: T) {
    this.listeners.forEach((l) => l(event));
  }
}
