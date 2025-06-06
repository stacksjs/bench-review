 
<script setup lang="ts">
import { ref } from 'vue'
import { BenchReviews } from '@/types/bench'

const user = ref({
  name: 'John Doe',
  joinDate: 'January 2024'
})

const stats = ref({
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
    title: 'Excellent Experience',
    content: 'Judge Johnson handled my case with exceptional professionalism and fairness. Her attention to detail and clear communication made the process much smoother than expected.',
    date: '2 days ago',
    dateTime: '2024-02-18T10:00',
    rating: 5.0,
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
    title: 'Professional Proceedings',
    content: 'Very impressed with the thoroughness of the proceedings. The judge maintained perfect decorum while ensuring all parties were heard.',
    date: '1 week ago',
    dateTime: '2024-02-11T14:30',
    rating: 4.0,
    likes: 18,
    comments: 3,
    type: 'Civil',
    status: 'Pending'
  }
])

useHead({
  // title: app.name,
  title: 'Profile - The Chamber of Secrets',
  meta: [
    { name: 'description', content: 'Profile.' },
  ],
})
</script> 

<template>
    <div class="min-h-screen">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <!-- Profile Header -->
        <div class="relative">
          <div class="absolute inset-0 h-32 bg-gradient-to-r from-gray-500 to-purple-600 rounded-t-2xl"></div>
          <div class="relative px-4 py-6 sm:px-6 sm:py-8">
            <div class="flex items-center">
              <img class="h-24 w-24 rounded-full ring-4 ring-white" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="" />
              <div class="ml-6">
                <h1 class="text-2xl font-bold text-white">{{ user.name }}</h1>
                <p class="text-gray-100">Member since {{ user.joinDate }}</p>
              </div>
            </div>
          </div>
        </div>
  
        <!-- Stats -->
        <div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt class="truncate text-sm font-medium text-gray-600">Total Reviews</dt>
            <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.totalReviews }}</dd>
          </div>
          <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt class="truncate text-sm font-medium text-gray-600">Judges Reviewed</dt>
            <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.judgesReviewed }}</dd>
          </div>
          <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt class="truncate text-sm font-medium text-gray-600">Average Rating</dt>
            <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.averageRating }}/5.0</dd>
          </div>
          <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt class="truncate text-sm font-medium text-gray-600">Helpful Votes</dt>
            <dd class="mt-1 text-3xl font-semibold tracking-tight text-gray-800">{{ stats.helpfulVotes }}</dd>
          </div>
        </div>
  
        <!-- Reviews Feed -->
        <ReviewSection :reviews="reviews" />
      </div>
    </div>
</template>
 