<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { User, Stats, BenchReviews } from '@/types/bench'

const route = useRoute()
const userId = route.params.id

const user = ref<User>({
  id: userId as string,
  name: 'John Doe',
  imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  joinDate: 'January 2024'
})

const stats = ref<Stats>({
  totalReviews: 24,
  judgesReviewed: 12,
  averageRating: 4.2,
  helpfulVotes: 156
})

const reviews = ref<BenchReviews[]>([
  {
    id: 1,
    author: {
      id: 1,
      name: 'John Doe',
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    judge: {
      id: '123',
      name: 'Hon. Sarah Johnson',
      court: 'Superior Court',
      imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    title: 'Excellent Experience with Judge Johnson',
    content: 'Judge Johnson handled my case with exceptional professionalism and fairness. Her attention to detail and clear communication made the process much smoother than expected.',
    date: '2 days ago',
    dateTime: '2024-02-18T10:00',
    rating: 5,
    likes: 24,
    comments: 5,
    type: 'Criminal',
    status: 'Closed'
  },
  {
    id: 2,
    author: {
      id: 1,
      name: 'John Doe',
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    judge: {
      id: '456',
      name: 'Hon. Robert Davis',
      court: 'Appellate Court',
      imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    title: 'Professional and Thorough Proceedings',
    content: 'Very impressed with the thoroughness of the proceedings. The judge maintained perfect decorum while ensuring all parties were heard.',
    date: '1 week ago',
    dateTime: '2024-02-11T15:30',
    rating: 4,
    likes: 18,
    comments: 3,
    type: 'Civil',
    status: 'Pending'
  }
])

onMounted(async () => {
  // Here you would typically fetch the user data, stats, and reviews based on the userId
  // For example:
  // const response = await fetch(`/api/users/${userId}`)
  // const data = await response.json()
  // user.value = data.user
  // stats.value = data.stats
  // reviews.value = data.reviews
})

useHead({
  title: `${user.value.name} - Bench`,
  meta: [
    { name: 'description', content: `View ${user.value.name}'s reviews and stats on Bench` }
  ]
})
</script> 

<template>
  <div class="min-h-screen">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <!-- Profile Header -->
      <div class="relative">
        <div class="absolute inset-0 h-32 bg-off-white-darker rounded-t-2xl"></div>
        <div class="relative px-4 py-6 sm:px-6 sm:py-8">
          <div class="flex items-center">
            <img class="h-24 w-24 rounded-full ring-4 ring-white" :src="user.imageUrl" :alt="user.name" />
            <div class="ml-6">
              <h1 class="text-2xl font-bold text-gray-800">{{ user.name }}</h1>
              <p class="text-gray-700">Member since {{ user.joinDate }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div class="overflow-hidden rounded-lg bg-off-gray px-4 py-5 shadow sm:p-6">
          <dt class="truncate text-sm font-medium text-gray-600">Total Reviews</dt>
          <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.totalReviews }}</dd>
        </div>
        <div class="overflow-hidden rounded-lg bg-off-gray px-4 py-5 shadow sm:p-6">
          <dt class="truncate text-sm font-medium text-gray-600">Judges Reviewed</dt>
          <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.judgesReviewed }}</dd>
        </div>
        <div class="overflow-hidden rounded-lg bg-off-gray px-4 py-5 shadow sm:p-6">
          <dt class="truncate text-sm font-medium text-gray-600">Average Rating</dt>
          <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.averageRating }}/5.0</dd>
        </div>
        <div class="overflow-hidden rounded-lg bg-off-gray px-4 py-5 shadow sm:p-6">
          <dt class="truncate text-sm font-medium text-gray-600">Helpful Votes</dt>
          <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.helpfulVotes }}</dd>
        </div>
      </div>

      <!-- Reviews Feed -->
      <div class="mt-8">
        <h2 class="text-lg font-medium text-gray-800">{{ user.name }}'s Reviews</h2>
        <div class="mt-6 space-y-6">
          <div v-for="review in reviews" :key="review.id" class="bg-off-gray shadow sm:rounded-lg">
            <div class="px-4 py-5 sm:p-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <img class="h-10 w-10 rounded-full" :src="review.judge.photo" :alt="review.judge.name" />
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-gray-800">
                      <router-link :to="`/judges/${review.judge.id}`" class="hover:underline">
                        {{ review.judge.name }}
                      </router-link>
                    </h3>
                    <p class="text-sm text-gray-600">{{ review.judge.court }}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-4">
                  <div class="flex items-center">
                    <svg v-for="star in 5" :key="star" 
                      class="h-5 w-5" 
                      :class="star <= review.rating ? 'text-yellow-400' : 'text-gray-300'"
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <span class="text-sm text-gray-600">{{ review.date }}</span>
                </div>
              </div>
              <div class="mt-4">
                <p class="text-sm text-gray-700">{{ review.content }}</p>
              </div>
              <div class="mt-4 flex items-center justify-between">
                <div class="flex items-center space-x-4">
                  <button type="button" class="inline-flex items-center text-sm text-gray-600 hover:text-gray-700">
                    <svg class="mr-1.5 h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 001.075.676L10 15.082l5.925 2.844A.75.75 0 0017 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0010 2z" clip-rule="evenodd" />
                    </svg>
                    {{ review.likes }}
                  </button>
                  <button type="button" class="inline-flex items-center text-sm text-gray-600 hover:text-gray-700">
                    <svg class="mr-1.5 h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.102 41.102 0 01-3.55.414c-.28.02-.521.18-.643.413l-1.712 3.293a.75.75 0 01-1.33 0l-1.713-3.293a.783.783 0 00-.642-.413 41.108 41.108 0 01-3.55-.414C1.993 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z" clip-rule="evenodd" />
                    </svg>
                    {{ review.comments }}
                  </button>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    {{ review.type }}
                  </span>
                  <span class="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                    {{ review.status }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
