import { useState } from 'react'
import type { Course } from '../types'
import { MOCK_COURSES, MOCK_TOURNAMENTS } from '../data'
import { useDataVersion, deleteCourse } from '../store'
import { PageHeader } from '../shell'
import { Button, SearchInput, EmptyState } from '../components'
import { useApp } from '../app-context'
import { navigate } from '../router'
import { IconPlus, IconPencil, IconTrash, Can } from './AdminShell'
import { canChangeCourse, organizerName } from './access'

export function useConfirmDeleteCourse() {
  const { showDialog, showToast } = useApp()
  return (c: Course, after?: () => void) => {
    const used = MOCK_TOURNAMENTS.filter(t => t.courseId === c.id).length
    if (used) {
      showDialog({
        title: "Can't delete this course",
        message: `${used} tournament${used > 1 ? 's are' : ' is'} held at ${c.name}. Move ${used > 1 ? 'them' : 'it'} to another course or delete ${used > 1 ? 'them' : 'it'} first.`,
        confirmLabel: 'View tournaments',
        cancelLabel: 'OK',
        onConfirm: () => navigate('/admin/tournaments'),
      })
      return
    }
    showDialog({
      title: 'Delete course?',
      message: `"${c.name}" and its scorecard will be removed. This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        const r = deleteCourse(c.id)
        if (r.ok) { showToast('Course deleted', 'info'); after?.() }
        else showToast(r.reason, 'error')
      },
    })
  }
}

/* ───────── List ───────── */

export function AdminCourses() {
  useDataVersion()
  const { can, adminUser, adminOrg } = useApp()
  const confirmDelete = useConfirmDeleteCourse()
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const rows = MOCK_COURSES.filter(c => !q || [c.name, c.city, c.region, c.designer].some(v => v.toLowerCase().includes(q)))

  return (
    <div className="page-in">
      <PageHeader
        eyebrow={adminOrg?.name ?? 'Admin console'}
        title="Courses"
        actions={<Can perm="courses.create"><Button variant="secondary" onClick={() => navigate('/admin/courses/import')}>Import from course database</Button><Button onClick={() => navigate('/admin/courses/new')}><IconPlus /> New course</Button></Can>}
      />

      {adminOrg && (
        <p className="text-gray-500 -mt-4 mb-6 max-w-2xl">All courses on the platform are listed so you can hold events at them. You can edit the courses your organisation added.</p>
      )}
      <div className="max-w-[440px] mb-5"><SearchInput value={search} onChange={setSearch} placeholder="Search courses…" /></div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-[28px] shadow-card">
          <EmptyState
            title={MOCK_COURSES.length ? 'No matching courses' : 'No courses yet'}
            subtitle={MOCK_COURSES.length ? 'Try a different search.' : 'Add a course before creating tournaments.'}
            action={MOCK_COURSES.length ? { label: 'Clear search', onClick: () => setSearch('') } : can('courses.create') ? { label: 'New course', onClick: () => navigate('/admin/courses/new') } : undefined}
          />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {rows.map(c => {
            const events = MOCK_TOURNAMENTS.filter(t => t.courseId === c.id).length
            return (
              <article key={c.id} className="bg-white rounded-[28px] shadow-card p-2 flex flex-col">
                <a href={`#/admin/courses/${c.id}`} className="relative h-40 rounded-[22px] overflow-hidden block">
                  <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
                  <span className="absolute top-3 left-3 glass-dark h-6 px-2.5 rounded-full text-[11px] font-semibold font-display text-white inline-flex items-center">
                    {events} event{events === 1 ? '' : 's'}
                  </span>
                  {c.lifecycle && c.lifecycle !== 'active' && (
                    <span className={`absolute top-3 right-3 h-6 px-2.5 rounded-full text-[11px] font-bold font-display inline-flex items-center capitalize ${c.lifecycle === 'draft' ? 'bg-white text-ink' : 'bg-gray-200 text-gray-600'}`}>{c.lifecycle}</span>
                  )}
                </a>
                <div className="px-3 pt-3.5 pb-2 flex-1 flex flex-col">
                  <h3 className="font-display font-bold text-ink text-[16px] tracking-tight">{c.name}</h3>
                  <p className="text-[11px] font-semibold font-display text-pine-600 mt-0.5">
                    {c.organizerId ? (c.organizerId === adminUser?.organizationId ? 'Added by your organisation' : `Added by ${organizerName(c.organizerId) ?? 'an organiser'}`) : 'Platform course'}
                  </p>
                  {c.source && <p className="text-[11px] text-gray-400" title={`${c.source.providerCourseId} · imported ${c.source.importedAt.slice(0, 10)} by ${c.source.importedBy}`}>Imported · {c.source.provider}{c.source.refreshedAt ? ` · updated ${c.source.refreshedAt.slice(0, 10)}` : ''}</p>}
                  <p className="text-[12px] text-gray-500 mt-0.5">{c.city}, {c.region}</p>
                  <div className="grid grid-cols-4 gap-1.5 mt-3">
                    {[[c.holes, 'Holes'], [c.par, 'Par'], [c.yardage.toLocaleString(), 'Yds'], [c.slope, 'Slope']].map(([v, l]) => (
                      <div key={String(l)} className="bg-canvas rounded-xl py-2 text-center">
                        <p className="font-display font-extrabold text-ink text-[14px] leading-none">{v}</p>
                        <p className="text-[10px] text-gray-500 font-semibold mt-1">{l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <a href={`#/admin/courses/${c.id}`} className="flex-1 h-10 rounded-full bg-ink text-white text-[13px] font-bold font-display flex items-center justify-center gap-2 hover:bg-pine-900">
                      {can('courses.edit') && canChangeCourse(adminUser, c) ? <><IconPencil /> Edit</> : 'View'}
                    </a>
                    {can('courses.delete') && canChangeCourse(adminUser, c) && <button onClick={() => confirmDelete(c)} aria-label={`Delete ${c.name}`} title="Delete"
                      className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"><IconTrash /></button>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
