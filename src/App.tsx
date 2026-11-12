import { useEffect } from 'react'
import { CourseImport } from './admin/CourseImport'
import './store' // load any saved admin edits before the first render
import { AppProvider, useApp, adminHomePath } from './app-context'
import { ALL_PERMISSIONS } from './admin/access'
import { useRoute, navigate, type Route } from './router'
import { AppLayout, Toast, Dialog } from './shell'
import { EmptyState } from './components'
import SignIn from './screens/SignIn'
import SignUp from './screens/SignUp'
import ProfileSetup from './screens/ProfileSetup'
import OrganizerSetup from './screens/OrganizerSetup'
import Home from './screens/Home'
import TournamentList from './screens/TournamentList'
import TournamentDetails from './screens/TournamentDetails'
import CourseDetails from './screens/CourseDetails'
import Leaderboard from './screens/Leaderboard'
import LivePlay from './screens/LivePlay'
import Profile from './screens/Profile'
import EditProfile from './screens/EditProfile'
import { AdminLayout, NoAccess } from './admin/AdminShell'
import { AdminRoles, AdminRoleEditor } from './admin/ManageRoles'
import { AdminUsers } from './admin/ManageUsers'
import { AdminOrganisation, AdminOrganizers } from './admin/Organizations'
import AdminDashboard from './admin/Dashboard'
import { AdminTournaments } from './admin/ManageTournaments'
import { TournamentWizard } from './admin/TournamentWizard'
import { AdminTournamentLive } from './admin/LiveControl'
import { AdminCourses } from './admin/ManageCourses'
import { CourseWizard } from './admin/CourseWizard'
import { StaffLayout, StaffHome, StaffEvent } from './staff/StaffConsole'

const AUTH_ROUTES: Route['name'][] = ['signin', 'signup', 'setup', 'organizer-setup']
const isAdminRoute = (r: Route) => r.name.startsWith('admin')
const isStaffRoute = (r: Route) => r.name.startsWith('staff')

function NotFound({ home }: { home: string }) {
  return (
    <div className="bg-white rounded-[32px] shadow-card">
      <EmptyState title="Page not found" subtitle="The page you're looking for doesn't exist."
        action={{ label: 'Go home', onClick: () => navigate(home) }} />
    </div>
  )
}

function Routes() {
  const { route } = useRoute()
  const { role, can } = useApp()
  const isAuthRoute = AUTH_ROUTES.includes(route.name)

  // Guards: signed-out users only see sign-in pages; each role stays in its own area
  useEffect(() => {
    // One sign-in page for golfers, organisers and admins; the account's role decides where it lands
    if (!role && !isAuthRoute) navigate('/signin', { replace: true })
    else if (role === 'golfer' && (isAuthRoute || isAdminRoute(route) || isStaffRoute(route))) navigate('/home', { replace: true })
    else if (role === 'staff' && !isStaffRoute(route)) navigate('/staff', { replace: true })
    else if (role === 'admin' && (isAuthRoute || !isAdminRoute(route))) navigate(adminHomePath(ALL_PERMISSIONS.filter(can)), { replace: true })
  }, [role, isAuthRoute, route, can])

  if (!role) {
    if (route.name === 'signup') return <SignUp />
    if (route.name === 'setup') return <ProfileSetup />
    if (route.name === 'organizer-setup') return <OrganizerSetup />
    return <SignIn />
  }

  const key = JSON.stringify(route)

  if (role === 'admin') {
    if (!isAdminRoute(route)) return null
    const page = (() => {
      switch (route.name) {
        case 'admin':                 return can('dashboard.view') ? <AdminDashboard key={key} /> : <NoAccess what="view the dashboard" />
        case 'admin-tournaments':     return can('tournaments.view') ? <AdminTournaments key={key} /> : <NoAccess what="view tournaments" />
        case 'admin-tournament-edit': return <TournamentWizard key={key} id={route.id} />
        case 'admin-tournament-live': return <AdminTournamentLive key={key} id={route.id} />
        case 'admin-courses':         return can('courses.view') ? <AdminCourses key={key} /> : <NoAccess what="view courses" />
        case 'admin-course-edit':     return <CourseWizard key={key} id={route.id} />
        case 'admin-course-import':   return <CourseImport key={key} />
        case 'admin-roles':           return <AdminRoles key={key} />
        case 'admin-role-edit':       return <AdminRoleEditor key={key} id={route.id} />
        case 'admin-users':           return <AdminUsers key={key} />
        case 'admin-organisation':    return <AdminOrganisation key={key} />
        case 'admin-organizers':      return <AdminOrganizers key={key} />
        default:                      return <NotFound home="/admin" />
      }
    })()
    return <AdminLayout route={route}>{page}</AdminLayout>
  }

  if (role === 'staff') {
    if (!isStaffRoute(route)) return null
    return (
      <StaffLayout route={route}>
        {route.name === 'staff-event' ? <StaffEvent key={key} id={route.id} tab={route.tab} /> : <StaffHome key={key} />}
      </StaffLayout>
    )
  }

  if (isAuthRoute || isAdminRoute(route) || isStaffRoute(route)) return null
  const page = (() => {
    switch (route.name) {
      case 'home':         return <Home key={key} />
      case 'tournaments':  return <TournamentList key={key} />
      case 'tournament':   return <TournamentDetails key={key} id={route.id} />
      case 'leaderboard':  return <Leaderboard key={key} id={route.id} />
      case 'play':         return <LivePlay key={key} id={route.id} />
      case 'course':       return <CourseDetails key={key} id={route.id} tournamentId={route.tournamentId} />
      case 'profile':      return <Profile key={key} />
      case 'edit-profile': return <EditProfile key={key} />
      default:             return <NotFound home="/home" />
    }
  })()

  return <AppLayout route={route}>{page}</AppLayout>
}

export default function App() {
  return (
    <AppProvider>
      <Routes />
      <Toast />
      <Dialog />
    </AppProvider>
  )
}
