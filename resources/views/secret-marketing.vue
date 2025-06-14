<script setup lang="ts">
import type { BenchReviews } from '@/types/bench'

defineOptions({
  name: 'HomePage',
})

// https://github.com/vueuse/head
// you can use this to manipulate the document head in any components,
// they will be rendered correctly in the html results with vite-ssg
useHead({
  // title: app.name,
  title: 'The Chamber of Secrets',
  meta: [
    { name: 'description', content: 'Coming soon.' },
  ],
  link: [
    {
      rel: 'icon',
      type: 'image/svg+xml',
    },
  ],
})

const review: BenchReviews = {
    id: 1,
    title: 'A Masterclass in Judicial Excellence: My Experience with Judge Sarah Johnson',
    author: {
      id: 1,
      name: 'Michael Chen',
      imageUrl: 'https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    judge: {
      id: '123',
      name: 'Hon. Sarah Johnson',
      court: 'Superior Court, California',
      imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    date: 'Mar 16, 2024',
    dateTime: '2024-03-16T10:00',
    rating: 5,
    status: 'Closed',
    likes: 256,
    comments: 48,
    type: 'Criminal Law',
    content: `
      <p class="text-xl leading-relaxed text-gray-700 mb-8">Having practiced law for over fifteen years, I've appeared before numerous judges, but my recent experience with Judge Sarah Johnson stands out as particularly noteworthy. This review aims to provide a comprehensive analysis of her judicial approach, courtroom management, and overall effectiveness in administering justice.</p>
  
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Courtroom Management and Efficiency</h2>
      <p class="text-lg text-gray-700 mb-6">Judge Johnson's courtroom runs like a well-oiled machine. From the moment proceedings begin, there's a palpable sense of organization and purpose. She maintains strict punctuality, respecting both the court's time and that of all parties involved. What particularly impressed me was her ability to keep proceedings moving efficiently without sacrificing thoroughness or due process.</p>
      <p class="text-lg text-gray-700 mb-6">Her pre-trial management is exemplary. Case management conferences are focused and productive, with clear deadlines and expectations set from the outset. She demonstrates remarkable skill in identifying key issues early, helping to streamline proceedings and avoid unnecessary delays.</p>
  
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Legal Knowledge and Decision-Making</h2>
      <p class="text-lg text-gray-700 mb-6">Perhaps most impressive is Judge Johnson's command of complex legal issues. During our three-week trial, she showed an exceptional ability to grasp intricate technical evidence while maintaining focus on the core legal principles at stake. Her rulings on evidentiary matters were swift and well-reasoned, demonstrating both deep knowledge of the rules of evidence and practical understanding of trial dynamics.</p>
      <p class="text-lg text-gray-700 mb-6">Her written opinions deserve special mention. They are clear, comprehensive, and well-structured, providing detailed analysis while remaining accessible to all parties. She takes particular care to address all key arguments raised by counsel, ensuring that her reasoning is transparent and her conclusions well-supported.</p>
  
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Temperament and Professionalism</h2>
      <p class="text-lg text-gray-700 mb-6">Throughout the proceedings, Judge Johnson maintained an ideal judicial temperament. She remained patient and attentive during lengthy testimony, while showing appropriate firmness when necessary to maintain order and decorum. Her treatment of all parties - attorneys, witnesses, and support staff - was uniformly professional and respectful.</p>
      <p class="text-lg text-gray-700 mb-6">What stands out is her ability to maintain control of the courtroom without being overbearing. Even in heated moments during cross-examination, she managed to keep proceedings civil and focused on the issues at hand.</p>
  
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Commitment to Justice</h2>
      <p class="text-lg text-gray-700 mb-6">Beyond her technical competence, Judge Johnson demonstrates a genuine commitment to ensuring justice is served. She takes great care to ensure that all parties have a fair opportunity to present their cases. In our case, she showed particular sensitivity to pro se litigants, providing appropriate guidance without compromising her neutrality.</p>
  
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Areas for Consideration</h2>
      <p class="text-lg text-gray-700 mb-6">While my overall experience was extremely positive, it's worth noting that Judge Johnson maintains very strict scheduling requirements. While this contributes to the efficiency of her courtroom, attorneys should be prepared for limited flexibility in scheduling matters. This is not necessarily a criticism, but rather a characteristic that counsel should be aware of when appearing before her.</p>
  
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Conclusion</h2>
      <p class="text-lg text-gray-700 mb-6">Judge Johnson represents the highest standards of judicial excellence. Her combination of legal acumen, efficient management, and professional demeanor makes appearing in her courtroom both challenging and rewarding. For attorneys preparing to appear before her, I would emphasize the importance of thorough preparation, punctuality, and professional conduct.</p>
      <p class="text-lg text-gray-700 mb-6">This review is based on my experience in a complex civil litigation matter, but I believe these observations would hold true across different types of proceedings. Judge Johnson's approach to judicial administration serves as a model for how our courts should function.</p>
    `
  }

</script>

<template>

  <main>
    <HeroSection />
    <div class="flex justify-center">
     <img src="/images/bench/arrow.svg" alt="Arrow" class="h-[24rem] opacity-30">
    </div>
    <div class="pt-16">
      <ArticleHeader :review="review" />
      <Article :review="review" />
    </div>
    <PricingSection />
    <TestimonialsSection />
    <CallToAction />
  </main>

</template>