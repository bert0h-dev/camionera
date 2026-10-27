import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/users/UsersPage'
import StaffListPage from './pages/staff/StaffListPage'
import StaffFormPage from './pages/staff/StaffFormPage'
import StaffDetailPage from './pages/staff/StaffDetailPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['hr', 'supervisor', 'coordinator']} />}>
            <Route path="/personal" element={<StaffListPage />} />
            <Route path="/personal/:id" element={<StaffDetailPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['hr']} />}>
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
