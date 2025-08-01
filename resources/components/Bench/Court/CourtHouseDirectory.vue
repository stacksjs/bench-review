<script setup lang="ts">
import { ref, computed } from 'vue'
import { courtHouses } from '../../../functions/sample'

const searchQuery = ref('')

const filteredCourtHouses = computed(() => {
  if (!searchQuery.value) return courtHouses.value
  const query = searchQuery.value.toLowerCase()
  return courtHouses.value.filter(court => 
    court.name.toLowerCase().includes(query) ||
    court.city.toLowerCase().includes(query) ||
    court.state.toLowerCase().includes(query)
  )
})
</script>

<template>
  <div class="min-h-screen">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <!-- Header Section -->
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">Court Directory</h1>
        <p class="mt-4 text-lg text-gray-600">Find courthouses across the United States</p>
      </div>

      <!-- Search and Filter Section -->
      <div class="mb-12 bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <div class="flex flex-col lg:flex-row gap-6">
          <div class="flex-1">
            <div class="relative">
              <input
                type="text"
                class="block w-full rounded-xl border-0 py-3 pl-12 pr-4 text-gray-900 bg-gray-50 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-softBrown sm:text-sm sm:leading-6 transition-all duration-200"
                placeholder="Search by name, city, or state..."
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
          </div>
        </div>
      </div>

      <!-- Court Houses Grid -->
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <router-link 
          v-for="court in filteredCourtHouses" 
          :key="court.id"
          :to="`courts/${court.id}/profile`"
          class="group relative bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 hover:border-softBrown"
        >
          <!-- Main Image Container -->
          <div class="relative h-48 w-full">
            <img 
              :src="court.image" 
              :alt="`${court.name} courthouse`"
              class="h-full w-full object-cover"
            >
            <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
            <div class="absolute bottom-4 left-4">
              <span class="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-700/10">
                {{ court.state }}
              </span>
            </div>
          </div>

          <!-- Content Container -->
          <div class="p-6">
            <div class="text-center">
              <h3 class="text-xl font-semibold text-gray-900 group-hover:text-deep-brown transition-colors duration-200">{{ court.name }}</h3>
              <p class="mt-2 text-sm text-gray-500">{{ court.city }}, {{ court.state }}</p>
              <p class="mt-1 text-sm text-gray-500">{{ court.address }}</p>
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
