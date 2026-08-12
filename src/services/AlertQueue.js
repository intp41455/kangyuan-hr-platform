class AlertQueue {
  constructor() {
    this.alerts = [];
  }

  enqueueAdminAlert({ message, level = 'warning' }) {
    const alert = {
      ts: new Date().toISOString(),
      message,
      level,
      channel: 'dingtalk-robot'
    };
    this.alerts.push(alert);
    return alert;
  }

  getAll() {
    return [...this.alerts];
  }

  getByLevel(level) {
    return this.alerts.filter(a => a.level === level);
  }

  clear() {
    this.alerts = [];
  }

  size() {
    return this.alerts.length;
  }
}

module.exports = AlertQueue;
