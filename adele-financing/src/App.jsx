import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import LoanProducts from './pages/LoanProducts'
import About from './pages/About'
import Team from './pages/Team'
import Contact from './pages/Contact'
import Apply from './pages/Apply'
import Services from './pages/Services'
import { AuthProvider } from './admin/AuthContext.jsx'
import { AdminRoute, AdminLayoutRoute } from './admin/AdminRoutes.jsx'
import AdminLogin from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import Customers from './pages/admin/Customers'
import LoanApplications from './pages/admin/LoanApplications'
import LoanProductsPage from './pages/admin/LoanProducts'
import Loans from './pages/admin/Loans'
import Payments from './pages/admin/Payments'
import Reports from './pages/admin/Reports'
import Finance from './pages/admin/Finance'
import Users from './pages/admin/Users'
import Settings from './pages/admin/Settings'
import AuditLogs from './pages/admin/AuditLogs'
import './App.css'

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/loan-products" element={<LoanProducts />} />
        <Route path="/services" element={<Services />} />
        <Route path="/about" element={<About />} />
        <Route path="/team" element={<Team />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="*" element={<Home />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />

      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayoutRoute />
          </AdminRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="loan-applications" element={<LoanApplications />} />
        <Route path="loan-products" element={<LoanProductsPage />} />
        <Route path="loans" element={<Loans />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="finance" element={<Finance />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
        <Route path="audit-logs" element={<AuditLogs />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App