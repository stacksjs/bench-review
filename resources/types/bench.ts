export interface BenchAuthor {
  id: number
  name: string
  imageUrl: string
}

export interface CourtHouse {
  id: string
  name: string
  image: string
  address: string
  city: string
  state: string
  zipCode: string
}

export interface Judge {
  id: string
  name: string
  court: CourtHouse
  photo: string
}

export interface BenchReviews {
  id: number
  author: BenchAuthor
  judge: Judge
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

export interface NotificationUser {
  name: string
  imageUrl: string
}

export interface BenchNotification {
  id: number
  user: NotificationUser
  message: string
  time: string
  unread: boolean
}

export interface Stats {
  totalReviews: number
  judgesReviewed: number
  averageRating: number
  helpfulVotes: number
}

export interface User {
  id: string
  name: string
  imageUrl: string
  joinDate: string
}

export interface BlogPost {
  id: number
  author: {
    id: number
    name: string
    imageUrl: string
  }
  title: string
  content: string
  date: string
  dateTime: string
}
