<template>
  <main>
    <div class="relative isolate">
      <div class="overflow-hidden">
        <div class="mx-auto max-w-7xl px-6 pb-32 pt-36 sm:pt-60 lg:px-8 lg:pt-32">
          <div class="mx-auto max-w-2xl gap-x-14 lg:mx-0 lg:flex lg:max-w-none lg:items-center">
            <div class="relative w-full lg:max-w-xl lg:shrink-0 xl:max-w-2xl">
              <h1 class="text-pretty text-5xl font-semibold tracking-tight text-gray-800 sm:text-7xl">Transparency in
                the Judiciary Starts Here</h1>

              <blockquote class="mt-8 border-l-4 border-gray-300 pl-4 italic ml-4">
                <p class="text-gray-700 leading-8">
                  "Publicity is justly commended as a remedy for social and industrial diseases. Sunlight is said to be
                  the best of disinfectants; electric light the most efficient policeman."
                </p>
                <footer class="mt-2 text-sm text-gray-500">
                  — Justice Louis D. Brandeis, "What Publicity Can Do," 1913
                </footer>
              </blockquote>

              <p class="mt-8 text-pretty text-lg font-medium text-gray-600 sm:max-w-md sm:text-xl/8 lg:max-w-none">
                Like Glassdoor but for the judiciary. Written by clerks, so you can get a glimpse into the inner workings of the court system.</p>
              <div class="mt-10 flex items-center gap-x-6">
                <router-link to="/judges"
                  class="rounded-sm bg-gray-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600">Find
                  a Judge</router-link>
                <router-link to="/review" class="text-sm/6 font-semibold text-gray-700">Write a Review <span
                    aria-hidden="true">→</span></router-link>
              </div>
            </div>
            <div class="mt-14 flex justify-center sm:-mt-44 lg:mt-0">
              <div class="w-full max-w-2xl">
                <div class="relative">
                  <img src="/images/bench/hero-image.webp" alt="Bench Hero"
                    class="w-full rounded-lg object-cover">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">

</script>