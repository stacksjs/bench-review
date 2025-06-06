<script setup lang="ts">
const route = useRoute()
const reviews = [
  {
    id: 1,
    name: 'Michael Chen',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    rating: 5,
    date: '2 weeks ago',
    content: 'Judge Johnson was extremely thorough and fair in handling my case. She took the time to understand all the details and made sure everyone had a chance to be heard. Her knowledge of the law is impressive, and she maintains a professional yet approachable demeanor in the courtroom.',
    helpfulCount: 12
  },
  {
    id: 2,
    name: 'Sarah Williams',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    rating: 4,
    date: '1 month ago',
    content: 'While I didn\'t get the outcome I was hoping for, I appreciate Judge Johnson\'s clear explanation of her decision and the legal reasoning behind it. She was respectful to all parties involved and maintained excellent control of the courtroom.',
    helpfulCount: 8
  },
  {
    id: 3,
    name: 'Robert Davis',
    avatar: 'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    rating: 5,
    date: '2 months ago',
    content: 'One of the most prepared and knowledgeable judges I\'ve appeared before. She asks insightful questions and ensures that all legal procedures are followed correctly. Her courtroom is well-organized and efficient.',
    helpfulCount: 15
  }
]
</script>

<template>
  <div class="-mx-4 px-4 py-8 bg-white shadow-sm ring-1 ring-gray-900/5 sm:mx-0 sm:rounded-lg sm:px-8 sm:pb-14 lg:col-span-2 lg:row-span-2 lg:row-end-2 xl:px-16 xl:pb-20 xl:pt-16">
    <!-- Overall Rating Summary -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold text-gray-900">4.8</h2>
        <div class="flex items-center">
          <div class="flex items-center">
            <svg v-for="i in 5" :key="i" class="h-5 w-5" :class="i <= 5 ? 'text-yellow-400' : 'text-gray-300'" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <p class="ml-2 text-sm text-gray-500">Based on 128 reviews</p>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <router-link :to="`/review/${route.params.id}`" class="rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600">
          Write a Review
        </router-link>
      </div>
    </div>

    <!-- Rating Distribution -->
    <div class="mt-8">
      <h3 class="text-base font-semibold text-gray-900">Rating Distribution</h3>
      <div class="mt-4 space-y-3">
        <div v-for="rating in 5" :key="rating" class="flex items-center">
          <span class="text-sm text-gray-500">{{ 6 - rating }} stars</span>
          <div class="ml-4 flex-1">
            <div class="h-2 rounded-full bg-gray-200">
              <div class="h-2 rounded-full bg-yellow-400" :style="{ width: `${(6 - rating) * 20}%` }"></div>
            </div>
          </div>
          <span class="ml-4 text-sm text-gray-500">{{ Math.floor((6 - rating) * 20) }}%</span>
        </div>
      </div>
    </div>

    <!-- Reviews List -->
    <div class="mt-8">
      <h3 class="text-base font-semibold text-gray-900">Reviews</h3>
      <div class="mt-6 space-y-8">
        <div v-for="review in reviews" :key="review.id" class="border-b border-gray-200 pb-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <img :src="review.avatar" :alt="review.name" class="h-10 w-10 rounded-full">
              <div class="ml-4">
                <h4 class="text-sm font-semibold text-gray-900">{{ review.name }}</h4>
                <div class="flex items-center">
                  <div class="flex items-center">
                    <svg v-for="i in 5" :key="i" class="h-4 w-4" :class="i <= review.rating ? 'text-yellow-400' : 'text-gray-300'" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <span class="ml-2 text-sm text-gray-500">{{ review.date }}</span>
                </div>
              </div>
            </div>
            <button type="button" class="text-sm font-semibold text-gray-600 hover:text-gray-500">
              Report
            </button>
          </div>
          <div class="mt-4 text-sm text-gray-500">
            <div class="relative">
              <p class="line-clamp-4">{{ review.content }}</p>
              <BlurReview color="white"/>
            </div>
            <div class="mt-2">
              <router-link 
                :to="`/article/${review.id}`"
                class="inline-block text-xs text-gray-600 hover:text-gray-500 hover:underline"
              >
                Read more
              </router-link>
            </div>
          </div>
          <div class="mt-4 flex items-center space-x-4">
            <button type="button" class="text-sm font-semibold text-gray-500 hover:text-gray-700">
              Helpful ({{ review.helpfulCount }})
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.line-clamp-4 {
  display: -webkit-box;
  line-clamp: 4;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style> 