import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { AppSplash } from './components/layout/AppSplash'
import { lazyPage } from './lib/pages'
// El login va en el paquete inicial: es la primera pantalla sin sesión
import LoginPage from './pages/LoginPage'

const HomePage = lazyPage('home')
const AccountPage = lazyPage('account')
const ForceChangePasswordPage = lazyPage('forceChange')
const ForgotPasswordPage = lazyPage('forgot')
const ResetPasswordPage = lazyPage('reset')
const UsersPage = lazyPage('users')
const UserDetailPage = lazyPage('userDetail')
const StaffListPage = lazyPage('staffList')
const StaffDetailPage = lazyPage('staffDetail')
const StaffFormPage = lazyPage('staffForm')
const SchedulesPage = lazyPage('schedules')
const AttendancePage = lazyPage('attendance')
const EvaluationsPage = lazyPage('evaluations')
const EvaluationDetailPage = lazyPage('evaluationDetail')
const PayrollPage = lazyPage('payroll')
const PayrollPeriodPage = lazyPage('payrollPeriod')
const SettingsPage = lazyPage('settings')
const AuditPage = lazyPage('audit')
const BusModelsPage = lazyPage('busModels')
const BusModelFormPage = lazyPage('busModelForm')
const FleetCatalogsPage = lazyPage('fleetCatalogs')
const BusesPage = lazyPage('buses')
const BusDetailPage = lazyPage('busDetail')
const BusFormPage = lazyPage('busForm')
const MaintenancePage = lazyPage('maintenance')
const MaintenanceOrderPage = lazyPage('maintenanceOrder')
const IncidentsPage = lazyPage('incidents')
const IncidentDetailPage = lazyPage('incidentDetail')
const FuelPage = lazyPage('fuel')
const RoutesPage = lazyPage('routes')
const RouteDetailPage = lazyPage('routeDetail')
const SeasonsPage = lazyPage('seasons')

function App() {
  return (
    // Pantallas fuera del layout (acceso); las del panel tienen su propio Suspense en AppLayout
    <Suspense fallback={<AppSplash />}>
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
            <Route element={<ProtectedRoute roles={['coordinator', 'supervisor']} />}>
              <Route path="/flota/modelos" element={<BusModelsPage />} />
              <Route path="/flota/modelos/:id" element={<BusModelFormPage />} />
              <Route path="/flota/catalogos" element={<FleetCatalogsPage />} />
              <Route path="/flota/unidades" element={<BusesPage />} />
              <Route path="/flota/unidades/:id" element={<BusDetailPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['coordinator', 'supervisor', 'mechanic']} />}>
              <Route path="/flota/mantenimiento" element={<MaintenancePage />} />
              <Route path="/flota/mantenimiento/:id" element={<MaintenanceOrderPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['coordinator', 'supervisor', 'mechanic', 'driver']} />}>
              <Route path="/flota/incidencias" element={<IncidentsPage />} />
              <Route path="/flota/incidencias/:id" element={<IncidentDetailPage />} />
              <Route path="/flota/combustible" element={<FuelPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['coordinator', 'supervisor', 'vendor']} />}>
              <Route path="/rutas" element={<RoutesPage />} />
              <Route path="/rutas/temporadas" element={<SeasonsPage />} />
              <Route path="/rutas/:id" element={<RouteDetailPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['coordinator']} />}>
              <Route path="/flota/modelos/nuevo" element={<BusModelFormPage />} />
              <Route path="/flota/unidades/nueva" element={<BusFormPage />} />
              <Route path="/flota/unidades/:id/editar" element={<BusFormPage />} />
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
    </Suspense>
  )
}

export default App
