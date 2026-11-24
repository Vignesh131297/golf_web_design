import type { Tournament } from './types'

/*
 * Sprint 5 · #187 / #189–#194: team tournament capacity.
 *
 * Team events (Four-Ball, Scramble) have a team limit and a golfer limit, kept apart. The organiser sets
 * the maximum number of teams; the golfer limit is derived from it (teams × team size), never typed.
 * Individual events keep a single golfer limit. Mirrors the backend's TournamentCapacity
 * (registeredPlayers, registeredTeams, remainingTeamSpots, remainingPlayerSpots).
 *
 * This file is the same in golf_web_design and golf_flutter_design.
 */

export const TEAM_FULL_MESSAGE = 'Registration is full. The maximum team capacity for this tournament has been reached.'
export const FIELD_FULL_MESSAGE = 'Registration is full. The maximum capacity for this tournament has been reached.'

export const isTeamEvent = (t: Tournament) =>
  t.participation === 'team' || t.format === 'Four-Ball' || t.format === 'Scramble'

export const teamSize = (t: Tournament) =>
  isTeamEvent(t) ? t.team?.size ?? (t.format === 'Scramble' ? 4 : 2) : 1

/**
 * Maximum teams. Older saved team events only have maxPlayers (a golfer count), so the team limit is
 * derived from it — the migration rule proposed for decision D1 in the Sprint 5 API contract.
 */
export const maxTeamsOf = (t: Tournament): number | undefined =>
  isTeamEvent(t) ? t.registration?.maxTeams ?? (t.maxPlayers ? Math.floor(t.maxPlayers / teamSize(t)) : undefined) : undefined

/** Golfer limit: teams × team size for team events, otherwise maxPlayers. 0 = no limit set. */
export const golferLimitOf = (t: Tournament) => {
  const teams = maxTeamsOf(t)
  return teams !== undefined ? teams * teamSize(t) : t.maxPlayers || 0
}

export interface Capacity {
  team: boolean
  size: number
  maxTeams?: number
  golferLimit: number
  registeredGolfers: number
  registeredTeams?: number
  remainingTeams?: number
  remainingGolfers: number
  /** Team events: free places in teams that already exist (a partner can still join) */
  partnerPlaces?: number
  full: boolean
}

/**
 * Registered counts come from the field (the server's registration records), not from what a screen
 * last showed. `golfers` is the registered golfer count; `teamIds` the team of each registered golfer.
 */
export function capacityOf(t: Tournament, golfers: number, teamIds: (string | undefined)[] = []): Capacity {
  const team = isTeamEvent(t)
  const size = teamSize(t)
  const golferLimit = golferLimitOf(t)
  const remainingGolfers = golferLimit ? Math.max(0, golferLimit - golfers) : Infinity
  if (!team) return { team, size, golferLimit, registeredGolfers: golfers, remainingGolfers, full: golferLimit > 0 && golfers >= golferLimit }
  const maxTeams = maxTeamsOf(t)
  // The demo field is a sample of the real one: count teams from it, then round up for the rest
  const named = new Set(teamIds.filter(Boolean)).size
  const registeredTeams = Math.max(named, Math.ceil(golfers / size))
  const remainingTeams = maxTeams !== undefined ? Math.max(0, maxTeams - registeredTeams) : undefined
  // A team with a free place can still take a partner even when no new team fits
  const partnerPlaces = registeredTeams * size - golfers
  const full = maxTeams !== undefined && remainingTeams === 0 && partnerPlaces <= 0
  return { team, size, maxTeams, golferLimit, registeredGolfers: golfers, registeredTeams, remainingTeams, remainingGolfers, partnerPlaces, full }
}

/** "3 / 5 teams · 6 golfers" or "18 / 40 golfers" */
export function capacityLabel(c: Capacity) {
  if (c.team) return `${c.registeredTeams} / ${c.maxTeams ?? '—'} teams · ${c.registeredGolfers} golfers`
  return `${c.registeredGolfers} / ${c.golferLimit || '—'} golfers`
}

export const fullMessage = (c: Capacity) => (c.team ? TEAM_FULL_MESSAGE : FIELD_FULL_MESSAGE)
