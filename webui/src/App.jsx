import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import MainLayout from './layouts/MainLayout.jsx'
import LoginPage from './pages/Login.jsx'

// 路由懒加载：首次只加载登录页，其他页面按需加载
const HREmployees = lazy(() => import('./pages/hr/Employees.jsx'))
const HRPayroll = lazy(() => import('./pages/hr/Payroll.jsx'))
const HRAnomalies = lazy(() => import('./pages/hr/Anomalies.jsx'))
const HRRules = lazy(() => import('./pages/hr/Rules.jsx'))

const DashboardOverview = lazy(() => import('./pages/dashboard/Overview.jsx'))
const DashboardBU = lazy(() => import('./pages/dashboard/BUCompare.jsx'))
const DashboardCompliance = lazy(() => import('./pages/dashboard/Compliance.jsx'))

const SelfHome = lazy(() => import('./pages/self/Home.jsx'))
const SelfPayslip = lazy(() => import('./pages/self/Payslip.jsx'))
const SelfLeave = lazy(() => import('./pages/self/Leave.jsx'))
const SelfAttendance = lazy(() => import('./pages/self/Attendance.jsx'))

const PageLoading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Spin size="large" tip="加载中..." />
  </div>
)

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<MainLayout />}>
        <Route index element={<Navigate to="/self" replace />} />

        <Route path="/self" element={<Suspense fallback={<PageLoading />}><SelfHome /></Suspense>} />
        <Route path="/self/payslip" element={<Suspense fallback={<PageLoading />}><SelfPayslip /></Suspense>} />
        <Route path="/self/leave" element={<Suspense fallback={<PageLoading />}><SelfLeave /></Suspense>} />
        <Route path="/self/attendance" element={<Suspense fallback={<PageLoading />}><SelfAttendance /></Suspense>} />

        <Route path="/hr/employees" element={<Suspense fallback={<PageLoading />}><HREmployees /></Suspense>} />
        <Route path="/hr/payroll" element={<Suspense fallback={<PageLoading />}><HRPayroll /></Suspense>} />
        <Route path="/hr/anomalies" element={<Suspense fallback={<PageLoading />}><HRAnomalies /></Suspense>} />
        <Route path="/hr/rules" element={<Suspense fallback={<PageLoading />}><HRRules /></Suspense>} />

        <Route path="/dashboard/overview" element={<Suspense fallback={<PageLoading />}><DashboardOverview /></Suspense>} />
        <Route path="/dashboard/bu" element={<Suspense fallback={<PageLoading />}><DashboardBU /></Suspense>} />
        <Route path="/dashboard/compliance" element={<Suspense fallback={<PageLoading />}><DashboardCompliance /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
