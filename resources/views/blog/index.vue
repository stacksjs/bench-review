<script setup lang="ts">
import { blogPosts } from '../../functions/sample'

defineOptions({
  name: 'BlogPage',
})

useHead({
  title: 'Blog - The Chamber of Secrets',
  meta: [
    { name: 'description', content: 'Latest articles and insights about the judicial system.' },
  ],
})
</script>

<template>
  <div class="min-h-screen">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 pb-32">
      <!-- Header Section -->
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">Blog</h1>
        <p class="mt-4 text-lg text-gray-600">Latest articles and insights about the judicial system</p>
      </div>

      <!-- Blog Posts List -->
      <div class="space-y-12">
        <router-link 
          v-for="post in blogPosts" 
          :key="post.id"
          :to="`/blog/${post.id}`"
          class="block group"
        >
          <article class="relative isolate flex flex-col gap-8 lg:flex-row rounded-2xl p-6 hover:bg-gray-50 transition-all duration-200">
            <div class="relative aspect-[16/9] sm:aspect-[2/1] lg:aspect-square lg:w-64 lg:shrink-0">
              <img :src="post.author.imageUrl" :alt="post.author.name" class="absolute inset-0 h-full w-full rounded-2xl bg-gray-50 object-cover">
              <div class="absolute inset-0 rounded-2xl ring-1 ring-inset ring-gray-900/10"></div>
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-x-4 text-xs">
                <time :datetime="post.dateTime" class="text-gray-500">{{ post.date }}</time>
              </div>
              <div class="group relative max-w-xl">
                <h3 class="mt-3 text-lg font-semibold leading-6 text-gray-900 group-hover:text-softBrown transition-colors duration-200">
                  {{ post.title }}
                </h3>
                <div class="mt-5 flex items-center gap-x-4">
                  <div class="text-sm leading-6">
                    <p class="font-semibold text-gray-900">
                      {{ post.author.name }}
                    </p>
                  </div>
                </div>
                <p class="mt-5 text-sm leading-6 text-gray-600 line-clamp-3">{{ post.content }}</p>
              </div>
            </div>
          </article>
        </router-link>
      </div>

      <!-- Pagination -->
      <div class="mt-16">
        <nav class="flex items-center justify-between border-t border-gray-200 px-4 sm:px-0">
          <div class="-mt-px flex w-0 flex-1">
            <a href="#" class="inline-flex items-center border-t-2 border-transparent pt-4 pr-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
              <svg class="mr-3 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.06l-4.5-4.25a.75.75 0 010-1.06l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
              </svg>
              Previous
            </a>
          </div>
          <div class="hidden md:-mt-px md:flex">
            <a href="#" class="inline-flex items-center border-t-2 border-soft-brown px-4 pt-4 text-sm font-medium text-soft-brown">1</a>
            <a href="#" class="inline-flex items-center border-t-2 border-transparent px-4 pt-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">2</a>
            <a href="#" class="inline-flex items-center border-t-2 border-transparent px-4 pt-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">3</a>
          </div>
          <div class="-mt-px flex w-0 flex-1 justify-end">
            <a href="#" class="inline-flex items-center border-t-2 border-transparent pt-4 pl-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
              Next
              <svg class="ml-3 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
              </svg>
            </a>
          </div>
        </nav>
      </div>
    </div>
  </div>
</template>
