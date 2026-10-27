import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/users/UsersPage'
import StaffListPage from './pages/staff/StaffListPage'
import StaffFormPage from './pages/staff/StaffFormPage'
import StaffDetailPage from './pages/staff/StaffDetailPage'
import SchedulesPage from './pages/schedules/SchedulesPage'
import AttendancePage from './pages/attendance/AttendancePage'
import EvaluationsPage from './pages/evaluations/EvaluationsPage'
import EvaluationDetailPage from './pages/evaluations/EvaluationDetailPage'
import PayrollPage from './pages/payroll/PayrollPage'
import PayrollPeriodPage from './pages/payroll/PayrollPeriodPage'
import AccountPage from './pages/account/AccountPage'
import ForceChangePasswordPage from './pages/auth/ForceChangePasswordPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import UserDetailPage from './pages/users/UserDetailPage'
import SettingsPage from './pages/settings/SettingsPage'
import AuditPage from './pages/audit/AuditPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/cambiar-contrasena" element={<ForceChangePasswordPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/mi-cuenta" element={<AccountPage />} />
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/usuarios/:id" element={<UserDetailPage />} />
            <Route path="/bitacora" element={<AuditPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['hr', 'supervisor', 'coordinator']} />}>
            <Route path="/personal" element={<StaffListPage />} />
            <Route path="/personal/:id" element={<StaffDetailPage />} />
            <Route path="/turnos" element={<SchedulesPage />} />
            <Route path="/asistencias" element={<AttendancePage />} />
            <Route path="/evaluaciones" element={<EvaluationsPage />} />
            <Route path="/evaluaciones/:id" element={<EvaluationDetailPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['hr']} />}>
            <Route path="/configuracion" element={<SettingsPage />} />
            <Route path="/nomina" element={<PayrollPage />} />
            <Route path="/nomina/:id" element={<PayrollPeriodPage />} />
            <Route path="/personal/nuevo" element={<StaffFormPage />} />
            <Route path="/personal/:id/editar" element={<StaffFormPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
