<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { judges } from '../../../functions/sample'

  const searchQuery = ref('')

  const filteredJudges = computed(() => {
    if (!searchQuery.value) return judges.value
    const query = searchQuery.value.toLowerCase()
    return judges.value.filter(judge => 
      judge.name.toLowerCase().includes(query) ||
      judge.court.name.toLowerCase().includes(query) ||
      judge.location.toLowerCase().includes(query)
    )
  })
</script> 

<template>
  <div class="min-h-screen">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <!-- Header Section -->
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">Judicial Directory</h1>
        <p class="mt-4 text-lg text-gray-600">Find and review judges across the United States</p>
      </div>

      <!-- Search and Filter Section -->
      <div class="mb-12 bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <div class="flex flex-col lg:flex-row gap-6">
          <div class="flex-1">
            <div class="relative">
              <input
                type="text"
                class="block w-full rounded-xl border-0 py-3 pl-12 pr-4 text-gray-900 bg-gray-50 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-softBrown sm:text-sm sm:leading-6 transition-all duration-200"
                placeholder="Search by name, court, or location..."
                v-model="searchQuery"
              >
              <div class="absolute inset-y-0 left-0 flex items-center pl-4">
                <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap gap-4">
            <select class="rounded-xl border-0 bg-gray-50 py-3 pl-4 pr-10 text-gray-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-softBrown sm:text-sm sm:leading-6 transition-all duration-200">
              <option>All Courts</option>
              <option>Supreme Court</option>
              <option>Appellate Court</option>
              <option>District Court</option>
            </select>
            <select class="rounded-xl border-0 bg-gray-50 py-3 pl-4 pr-10 text-gray-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-softBrown sm:text-sm sm:leading-6 transition-all duration-200">
              <option>All States</option>
              <option>California</option>
              <option>New York</option>
              <option>Texas</option>
              <option>Florida</option>
            </select>
            <select class="rounded-xl border-0 bg-gray-50 py-3 pl-4 pr-10 text-gray-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-softBrown sm:text-sm sm:leading-6 transition-all duration-200">
              <option>Rating</option>
              <option>4+ Stars</option>
              <option>3+ Stars</option>
              <option>2+ Stars</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Judges Grid -->
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <router-link 
          v-for="judge in filteredJudges" 
          :key="judge.id"
          :to="`judges/${judge.id}/profile`"
          class="group relative bg-off-gray rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 hover:border-softBrown"
        >
          <!-- Background Image Container -->
          <div class="absolute inset-0 z-0">
            <img 
              :src="judge.court.image" 
              :alt="`${judge.court.name} courthouse`"
              class="h-full w-full object-cover opacity-10 group-hover:opacity-30 transition-all duration-300"
            >
            <div class="absolute inset-0 bg-gradient-to-b from-white/70 via-white/40 to-white/80 group-hover:from-white/60 group-hover:via-white/30 group-hover:to-white/70 transition-all duration-300"></div>
          </div>

          <!-- Content Container -->
          <div class="relative z-10 p-6">
            <div class="relative">
              <div class="mx-auto h-40 w-40 overflow-hidden rounded-full ring-4 ring-gray-50 group-hover:ring-softBrown transition-all duration-300">
                <img class="h-full w-full object-cover filter grayscale group-hover:grayscale-0 transition-all duration-300" :src="judge.photo" :alt="judge.name">
              </div>
              <div class="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                <span class="inline-flex items-center rounded-full bg-warm-gray px-3 py-1 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-700/10">
                  {{ judge.court.name }}
                </span>
              </div>
            </div>
            
            <div class="mt-8 text-center">
              <h3 class="text-xl font-semibold text-gray-900 group-hover:text-deep-brown transition-colors duration-200">{{ judge.name }}</h3>
              <p class="mt-2 text-sm text-gray-500">{{ judge.location }}</p>
              
              <div class="mt-4 flex items-center justify-center">
                <div class="flex items-center">
                  <svg v-for="star in 5" :key="star" 
                     :class="[star <= judge.rating ? 'text-yellow-400' : 'text-gray-200', 'h-5 w-5 flex-shrink-0']"
                        viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clip-rule="evenodd" />
                  </svg>
                </div>
                <span class="ml-2 text-sm text-gray-500">({{ judge.reviewCount }} reviews)</span>
              </div>
            </div>
          </div>
        </router-link>
      </div>

      <!-- Pagination -->
      <div class="mt-16">
        <nav class="flex items-center justify-between border-t border-gray-200 px-4 sm:px-0">
          <div class="-mt-px flex w-0 flex-1">
            <a href="#" class="inline-flex items-center border-t-2 border-transparent pt-4 pr-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
              <svg class="mr-3 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
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
