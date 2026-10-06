// Mock blog content for the /blog views.
//
// This file used to export invented judges, courthouses, reviews, categories,
// trending judges and an activity feed, and real pages consumed them:
//
//   - court-houses/[id].stx resolved the courthouse from `courtHouses` with a
//     `|| courtHouses[0]` fallback, so all 202 built courthouse pages named
//     "Supreme Court of California" regardless of which one they were for
//   - home.stx took its category chips from `categories`, whose names no
//     longer exist in the data at all
//   - LeftSidebar.stx rendered `trendingJudges` and `recentActivity`
//
// The first two were repointed at real data (e6fd9ca1) and LeftSidebar was
// dead code and is gone, so those six exports had no consumers left. They are
// removed rather than kept "just in case": anything importing one symbol from
// this module bundles the whole thing, which is how invented judge names were
// reaching 410 built pages while being rendered on almost none of them.
//
// What remains is `blogPosts` — placeholder marketing copy for /blog, with
// invented authors. That is ordinary lorem-ipsum territory, not a claim about
// a real person, but it is still the reason /blog ships mock content and
// should be replaced when the blog gets a backing source.
import type { BlogPost } from '~/resources/types'

export const blogPosts: BlogPost[] = [
  {
    id: 1,
    author: {
      id: 1,
      name: 'Michael Chen',
      imageUrl: 'https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'Understanding Judicial Ethics in Modern Courts',
    content: `The landscape of judicial ethics has evolved significantly in recent years, presenting new challenges and considerations for both judges and legal professionals. This article explores the fundamental principles of judicial ethics and their application in today's complex legal environment.

    Key areas of focus include:
    - The role of technology in judicial decision-making
    - Balancing transparency with privacy concerns
    - Managing conflicts of interest in an interconnected world
    - The impact of social media on judicial conduct`,
    date: '2h ago',
    dateTime: '2024-02-20T10:00',
  },
  {
    id: 2,
    author: {
      id: 2,
      name: 'Sarah Williams',
      imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'The Future of Court Technology',
    content: `As courts continue to modernize, technology plays an increasingly vital role in the administration of justice. This article examines emerging trends in court technology and their implications for the legal system.

    Topics covered:
    - Virtual courtrooms and remote proceedings
    - AI-assisted legal research and analysis
    - Digital evidence management systems
    - Cybersecurity in court operations`,
    date: '4h ago',
    dateTime: '2024-02-20T08:00',
  },
  {
    id: 3,
    author: {
      id: 3,
      name: 'David Rodriguez',
      imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'Access to Justice: Breaking Down Barriers',
    content: `Ensuring equal access to justice remains one of the most pressing challenges in our legal system. This article explores innovative approaches to making legal services more accessible to all citizens.

    Key initiatives discussed:
    - Pro bono programs and legal aid services
    - Simplified court procedures
    - Community legal education
    - Technology-driven solutions for access`,
    date: '1d ago',
    dateTime: '2024-02-19T14:30',
  },
]
