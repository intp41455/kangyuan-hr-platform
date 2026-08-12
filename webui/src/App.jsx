import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import LoginPage from './pages/Login.jsx'

// HR 管理后台
import HREmployees from './pages/hr/Employees.jsx'
import HRPayroll from './pages/hr/Payroll.jsx'
import HRAnomalies from './pages/hr/Anomalies.jsx'
import HRRules from './pages/hr/Rules.jsx'

// 高管驾驶舱
import DashboardOverview from './pages/dashboard/Overview.jsx'
import DashboardBU from './pages/dashboard/BUCompare.jsx'
import DashboardCompliance from './pages/dashboard/Compliance.jsx'

// 员工自助
import SelfHome from './pages/self/Home.jsx'
import SelfPayslip from './pages/self/Payslip.jsx'
import SelfLeave from './pages/self/Leave.jsx'
import SelfAttendance from './pages/self/Attendance.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<MainLayout />}>
        {/* 默认重定向 */}
        <Route index element={<Navigate to="/self" replace />} />

        {/* 员工自助 */}
        <Route path="/self" element={<SelfHome />} />
        <Route path="/self/payslip" element={<SelfPayslip />} />
        <Route path="/self/leave" element={<SelfLeave />} />
        <Route path="/self/attendance" element={<SelfAttendance />} />

        {/* HR 管理 */}
        <Route path="/hr/employees" element={<HREmployees />} />
        <Route path="/hr/payroll" element={<HRPayroll />} />
        <Route path="/hr/anomalies" element={<HRAnomalies />} />
        <Route path="/hr/rules" element={<HRRules />} />

        {/* 高管驾驶舱 */}
        <Route path="/dashboard/overview" element={<DashboardOverview />} />
        <Route path="/dashboard/bu" element={<DashboardBU />} />
        <Route path="/dashboard/compliance" element={<DashboardCompliance />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
