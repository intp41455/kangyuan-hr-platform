class EmployeeRegistry {
  constructor() {
    this.employees = new Map();
  }

  getAll() {
    return Array.from(this.employees.values());
  }

  getById(id) {
    return this.employees.get(id) || null;
  }

  getByDingTalkId(dingtalkUserId) {
    return this.getAll().find(e => e.dingtalkUserId === dingtalkUserId) || null;
  }

  size() {
    return this.employees.size;
  }

  add(employee) {
    const now = new Date().toISOString();
    const record = {
      ...employee,
      createdAt: employee.createdAt || now,
      updatedAt: now
    };
    this.employees.set(record.id, record);
    return record;
  }

  update(id, updates) {
    const existing = this.employees.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updates,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    this.employees.set(id, updated);
    return updated;
  }

  remove(id) {
    return this.employees.delete(id);
  }

  seed(count = 100) {
    const firstNames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高'];
    const lastNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛'];
    const depts = [101, 102, 103, 104, 105];
    const titles = ['工程师', '经理', '主管', '专员', '总监', '助理'];

    for (let i = 1; i <= count; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const emp = {
        id: `EMP${String(i).padStart(5, '0')}`,
        name: firstName + lastName,
        email: `emp${i}@company.com`,
        mobile: `138${String(10000000 + i).slice(-8)}`,
        dingtalkUserId: `DD${String(10000 + i)}`,
        department: depts[i % depts.length],
        title: titles[i % titles.length],
        directLeader: i > 1 ? `EMP${String(((i - 2) % 10) + 1).padStart(5, '0')}` : null,
        status: 'active',
        entryDate: `202${i % 5}-${String((i % 12) + 1).padStart(2, '0')}-01`
      };
      this.add(emp);
    }
    return this;
  }
}

module.exports = EmployeeRegistry;
