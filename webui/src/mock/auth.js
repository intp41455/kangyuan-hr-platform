// 钉钉 H5 免登 Mock
// 实际生产环境：调用 dingtalk-jsapi.runtime.permission.requestAuthCode
// 获取 authCode 后传给后端换取 user_id
// 开发模式：直接返回 Mock 用户

const DEV_USERS = {
  'EMP001': {
    empId: 'EMP001',
    name: '王宁',
    avatar: '',
    role: 'HR_ADMIN',        // HR 总监
    dept: '集团总部·人力资源部',
    workLocation: '西安',
    businessUnit: 'GROUP_HQ',
    permissions: ['hr:*', 'dashboard:*', 'self:*', 'rule:read', 'rule:write']
  },
  'EMP002': {
    empId: 'EMP002',
    name: '李明',
    avatar: '',
    role: 'EXECUTIVE',
    dept: '集团总部·董事会',
    workLocation: '西安',
    businessUnit: 'GROUP_HQ',
    permissions: ['dashboard:*', 'self:*']
  },
  'EMP003': {
    empId: 'EMP003',
    name: '张三',
    avatar: '',
    role: 'EMPLOYEE',
    dept: '康源美宏·西安养护院',
    workLocation: '西安',
    businessUnit: 'BU_MEIHONG',
    permissions: ['self:*']
  }
}

const STORAGE_KEY = 'kangyuan_mock_auth'

export function mockLogin(empId = 'EMP001') {
  const user = DEV_USERS[empId] || DEV_USERS['EMP003']
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  return user
}

export function mockLogout() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getCurrentUser() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function hasPermission(user, permission) {
  if (!user || !user.permissions) return false
  return user.permissions.some(p => {
    if (p === permission) return true
    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -1)
      return permission.startsWith(prefix)
    }
    return false
  })
}
