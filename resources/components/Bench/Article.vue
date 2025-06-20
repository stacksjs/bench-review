<script setup lang="ts">
import type { BenchReviews } from '@/types/bench';

const props = defineProps<{
  review: BenchReviews
}>()

const review = props.review

defineOptions({
  name: 'ReviewDetailPage',
})

useHead({
  title: 'Review - A Masterclass in Judicial Excellence - The Chamber of Secrets',
  meta: [
    { name: 'description', content: 'A detailed review of Judge Sarah Johnson\'s judicial excellence and courtroom management.' },
  ],
})
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-32">
    <div class="mx-auto mt-6 text-gray-500">
      <div class="flex items-center mb-8">
        <div class="flex items-center">
          <svg v-for="star in 5" :key="star" 
            class="h-5 w-5" 
            :class="star <= review.rating ? 'text-yellow-400' : 'text-gray-300'"
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
        <span class="ml-2 text-sm text-gray-500">({{ review.rating }})</span>
      </div>

      <div class="review-content relative">
        <div v-html="review.content" class="text-lg text-gray-700 space-y-6 line-clamp-10"></div>
        <BlurReview />
      </div>

      <PaywallCta />

      <!-- Article footer -->
      <div class="mt-[300px] border-t border-gray-200 pt-8">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <button class="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900">
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
              </svg>
              <span>{{ review.likes }}</span>
            </button>
            <button class="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900">
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 001.28.53l3.58-3.579a.78.78 0 01.527-.224 41.202 41.202 0 005.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zm0 7a1 1 0 100-2 1 1 0 000 2zM8 8a1 1 0 11-2 0 1 1 0 012 0zm5 1a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
              <span>{{ review.comments }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>