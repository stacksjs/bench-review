/**
 * Shared domain types for stx components and views.
 *
 * Importable from any `<script client>` via:
 *   import type { Judge, Review } from '~/resources/types'
 *
 * Shapes mirror the sample data in `resources/functions/sample.ts` and
 * what each component currently passes around as untyped objects.
 * Tighten as the backend takes over and real schemas land.
 */

export interface CourtHouse {
  id: string
  name: string
  image: string
  address: string
  city: string
  state: string
  zipCode: string
}

export interface Court {
  name: string
  image: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
}

export type PracticeArea = 'criminal' | 'civil' | 'family' | 'probate' | 'appellate' | 'bankruptcy' | 'other'

export interface Judge {
  id: number | string
  name: string
  location: string
  appointedYear: string
  rating: number
  court: Court
  reviewCount: number
  department: string
  photo: string
  // Practice-area category. `null` for unclassified rows (legacy
  // factory-seeded judges from before the backfill landed). The
  // /reviews "Explore Categories" sidebar derives counts off this
  // and only shows tiles for non-null values.
  practice_area?: PracticeArea | null
}

export interface TrendingJudge {
  id: number | string
  name: string
  court: string
  imageUrl?: string
  photo?: string
}

export interface Category {
  name: string
  count: number
  current: boolean
  icon: string
}

export interface Author {
  id: number | string
  name: string
  imageUrl: string
}

export type ReviewStatus = 'In Progress' | 'Resolved' | 'Pending' | 'Closed'
export type ReviewType = 'Criminal' | 'Civil' | 'Family' | 'Probate' | 'Appellate' | 'Bankruptcy'

export interface Review {
  id: number | string
  author: Author
  judge: {
    id: number | string
    name: string
    court: Court | { name: string; image?: string }
    imageUrl?: string
    photo?: string
  }
  title: string
  content: string
  date: string
  dateTime: string
  likes: number
  rating: number
  comments: number
  type: string
  status: string
}

export interface Activity {
  id: number | string
  content: string
  date: string
  dateTime: string
  icon: string
  /** Precomputed inline SVG for the activity marker (trusted constant). */
  iconSvg?: string
}

export interface BlogPost {
  id: number | string
  author: Author
  title: string
  content: string
  date: string
  dateTime: string
}

export interface UserProfile {
  id?: number | string
  name?: string
  email?: string
  avatar?: string
  created_at?: string
  createdAt?: string
  // Role names from RBAC. Populated by the auth store's `fetchMe()`
  // call against `/api/me` on hydration / after login. Drives
  // conditional UI like the "Admin" link in BenchHeader.
  roles?: string[]
}

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationItem {
  id: number | string
  user: { name: string; imageUrl: string }
  message: string
  time: string
  unread: boolean
}
