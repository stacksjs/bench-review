// Sample data - replace with actual data from your backend
import type { Activity, BlogPost, Category, CourtHouse, Judge, Review, TrendingJudge } from '~/resources/types'

export const courtHouses: CourtHouse[] = [
  {
    id: '1',
    name: 'Supreme Court of California',
    image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
    address: '350 McAllister Street',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
  },
  {
    id: '2',
    name: 'Appellate Court of New York',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
    address: '27 Madison Avenue',
    city: 'New York',
    state: 'NY',
    zipCode: '10010',
  },
  {
    id: '3',
    name: 'District Court of Texas',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
    address: '515 Rusk Street',
    city: 'Houston',
    state: 'TX',
    zipCode: '77002',
  },
  {
    id: '4',
    name: 'Supreme Court of Florida',
    image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
    address: '500 South Duval Street',
    city: 'Tallahassee',
    state: 'FL',
    zipCode: '32399',
  },
  {
    id: '5',
    name: 'District Court of Illinois',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
    address: '219 South Dearborn Street',
    city: 'Chicago',
    state: 'IL',
    zipCode: '60604',
  },
]

export const judges: Judge[] = [
  {
    id: 1,
    name: 'Hon. Sarah Johnson',
    location: 'California',
    appointedYear: '2018',
    rating: 4.5,
    court: {
      name: 'Supreme Court',
      image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 128,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 2,
    name: 'Hon. Michael Chen',
    location: 'New York',
    appointedYear: '2019',
    rating: 4.2,
    court: {
      name: 'Appellate Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 95,
    department: 'San Francisco County, Department 12',
    photo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 3,
    name: 'Hon. Maria Rodriguez',
    location: 'Texas',
    appointedYear: '2020',
    rating: 4.8,
    court: {
      name: 'District Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 156,
    department: 'San Francisco County, Department 12',
    photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 4,
    name: 'Hon. James Wilson',
    location: 'Florida',
    appointedYear: '2017',
    rating: 4.3,
    court: {
      name: 'Supreme Court',
      image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 112,
    department: 'San Francisco County, Department 12',
    photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 5,
    name: 'Hon. Emily Thompson',
    location: 'Illinois',
    appointedYear: '2019',
    rating: 4.6,
    court: {
      name: 'District Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 143,
    department: 'San Francisco County, Department 12',
    photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 6,
    name: 'Hon. David Kim',
    location: 'Washington',
    appointedYear: '2018',
    rating: 4.4,
    court: {
      name: 'Appellate Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 89,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 7,
    name: 'Hon. Lisa Martinez',
    location: 'Arizona',
    appointedYear: '2020',
    rating: 4.7,
    court: {
      name: 'Supreme Court',
      image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 167,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 8,
    name: 'Hon. Robert Taylor',
    location: 'Massachusetts',
    appointedYear: '2017',
    rating: 4.1,
    court: {
      name: 'District Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 78,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 9,
    name: 'Hon. Patricia Lee',
    location: 'Virginia',
    appointedYear: '2019',
    rating: 4.5,
    court: {
      name: 'Appellate Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 134,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 10,
    name: 'Hon. Thomas Anderson',
    location: 'Oregon',
    appointedYear: '2018',
    rating: 4.3,
    court: {
      name: 'Supreme Court',
      image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 102,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 11,
    name: 'Hon. Jennifer Garcia',
    location: 'Colorado',
    appointedYear: '2020',
    rating: 4.9,
    court: {
      name: 'District Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 189,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 12,
    name: 'Hon. William Brown',
    location: 'Michigan',
    appointedYear: '2017',
    rating: 4.4,
    court: {
      name: 'Appellate Court',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      address: '123 Main St, Anytown, USA',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    },
    reviewCount: 145,
    department: 'San Francisco County, Department 15',
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80',
  },
]

export const categories: Category[] = [
  { name: 'Criminal', count: 428, current: true, icon: 'ScaleIcon' },
  { name: 'Civil', count: 312, current: false, icon: 'DocumentTextIcon' },
  { name: 'Family', count: 256, current: false, icon: 'HomeIcon' },
  { name: 'Probate', count: 252, current: false, icon: 'DocumentDuplicateIcon' },
  { name: 'Appellate', count: 198, current: false, icon: 'ArrowPathIcon' },
  { name: 'Bankruptcy', count: 156, current: false, icon: 'BanknotesIcon' },
]

export const reviews: Review[] = [
  {
    id: 1,
    author: {
      id: 1,
      name: 'Michael Chen',
      imageUrl: 'https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    judge: {
      id: '123',
      name: 'Hon. Sarah Johnson',
      court: {
        name: 'Superior Court',
        image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      },
      imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'Topnotch Judicial Excellence!',
    content: `Judge Johnson handled my case with exceptional professionalism and fairness. Her attention to detail and clear communication made the process much smoother than expected. Throughout the proceedings,
      she demonstrated a deep understanding of the law while maintaining a balanced and impartial approach. Her ability to manage complex legal arguments and maintain courtroom decorum was impressive.
      The judge took the time to explain key decisions and ensured all parties were heard. Her written opinions were thorough and well-reasoned, providing clear guidance for future cases.
      I particularly appreciated how she managed to keep the proceedings moving efficiently without sacrificing thoroughness. Her commitment to justice and fairness was evident in every aspect of the case.`,
    date: '2h ago',
    dateTime: '2024-02-20T10:00',
    likes: 24,
    rating: 4,
    comments: 5,
    type: 'Criminal',
    status: 'In Progress',
  },
  {
    id: 2,
    author: {
      id: 2,
      name: 'Sarah Williams',
      imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    judge: {
      id: '456',
      name: 'Hon. Robert Davis',
      court: {
        name: 'Appellate Court',
        image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      },
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'A Masterclass in Judicial Excellence!',
    content: `Very impressed with the thoroughness of the proceedings. The judge maintained perfect decorum while ensuring all parties were heard. His approach to case management was exemplary,
    with clear timelines and expectations set from the beginning. The judge demonstrated exceptional knowledge of both procedural and substantive law,
    which helped streamline the process significantly. His written decisions were comprehensive and well-articulated, making complex legal concepts accessible to all parties.`,
    date: '4h ago',
    dateTime: '2024-02-20T08:00',
    rating: 3.5,
    likes: 18,
    comments: 3,
    type: 'Civil',
    status: 'Pending',
  },
  {
    id: 3,
    author: {
      id: 3,
      name: 'David Rodriguez',
      imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    judge: {
      id: '789',
      name: 'Hon. Maria Garcia',
      court: {
        name: 'Family Court',
        image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      },
      imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'Compassionate and Fair in Family Matters',
    content: `Judge Garcia showed remarkable sensitivity in handling our family case. She took the time to understand the complexities of our situation and made sure both parties felt heard. Her decisions were well-reasoned and focused on the best interests of the children involved. The judge maintained a professional yet approachable demeanor throughout the proceedings.`,
    date: '1d ago',
    dateTime: '2024-02-19T14:30',
    rating: 4.8,
    likes: 32,
    comments: 7,
    type: 'Family',
    status: 'Pending',
  },
  {
    id: 4,
    author: {
      id: 4,
      name: 'Jennifer Lee',
      imageUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    judge: {
      id: '101',
      name: 'Hon. James Wilson',
      court: {
        name: 'Probate Court',
        image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      },
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'Efficient Probate Proceedings',
    content: `Judge Wilson handled our probate case with remarkable efficiency while maintaining thoroughness. His knowledge of probate law was evident, and he guided us through the process with clear explanations. The judge was particularly helpful in mediating disputes between family members and ensuring fair distribution of assets.`,
    date: '2d ago',
    dateTime: '2024-02-18T11:15',
    rating: 4.2,
    likes: 15,
    comments: 2,
    type: 'Probate',
    status: 'Pending',
  },
  {
    id: 5,
    author: {
      id: 5,
      name: 'Robert Thompson',
      imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    judge: {
      id: '202',
      name: 'Hon. Emily Thompson',
      court: {
        name: 'Bankruptcy Court',
        image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      },
      imageUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    title: 'Clear Guidance Through Bankruptcy',
    content: `Judge Thompson provided excellent guidance through our bankruptcy proceedings. Her expertise in bankruptcy law was evident, and she explained complex financial concepts in understandable terms. The judge was fair to both debtors and creditors, ensuring a balanced approach to the case. Her written decisions were thorough and well-reasoned.`,
    date: '3d ago',
    dateTime: '2024-02-17T09:45',
    rating: 4.5,
    likes: 21,
    comments: 4,
    type: 'Bankruptcy',
    status: 'In Progress',
  },
]

export const trendingJudges: TrendingJudge[] = [
  {
    id: 1,
    name: 'Hon. Sarah Johnson',
    court: 'Superior Court',
    imageUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 2,
    name: 'Hon. Robert Davis',
    court: 'Appellate Court',
    imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 3,
    name: 'Hon. Maria Garcia',
    court: 'Family Court',
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
]

export const recentActivity: Activity[] = [
  {
    id: 1,
    content: 'New review posted for Hon. Sarah Johnson',
    date: '1h ago',
    dateTime: '2024-02-20T11:00',
    icon: 'ChatBubbleLeftIcon',
  },
  {
    id: 2,
    content: 'Case CR-2024-001 updated',
    date: '2h ago',
    dateTime: '2024-02-20T10:00',
    icon: 'DocumentTextIcon',
  },
  {
    id: 3,
    content: 'New judge profile added',
    date: '3h ago',
    dateTime: '2024-02-20T09:00',
    icon: 'UserPlusIcon',
  },
  {
    id: 4,
    content: 'Case FC-2024-015 status changed to Closed',
    date: '4h ago',
    dateTime: '2024-02-20T08:00',
    icon: 'CheckCircleIcon',
  },
  {
    id: 5,
    content: 'New comment added to review #123',
    date: '5h ago',
    dateTime: '2024-02-20T07:00',
    icon: 'ChatBubbleLeftRightIcon',
  },
  {
    id: 6,
    content: 'Case BK-2024-003 scheduled for hearing',
    date: '6h ago',
    dateTime: '2024-02-20T06:00',
    icon: 'CalendarIcon',
  },
]

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
