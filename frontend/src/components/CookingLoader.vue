<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// generation takes a few seconds, so say something different every couple of them
// rather than leaving a spinner sitting there
const messages = [
  'Reading your ingredients…',
  'Rummaging through the pantry…',
  'Heating the pan…',
  'Tasting and adjusting…',
  'Writing it all down…'
]

const index = ref(0)
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    // hold on the last line rather than looping back to the start
    if (index.value < messages.length - 1) index.value += 1
  }, 2200)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="cook" role="status" aria-live="polite">
    <div class="cook__scene" aria-hidden="true">
      <span class="cook__steam cook__steam--a"></span>
      <span class="cook__steam cook__steam--b"></span>
      <span class="cook__steam cook__steam--c"></span>

      <div class="cook__pot">
        <div class="cook__bubbles">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="cook__hob"></div>
    </div>

    <p class="cook__label">{{ messages[index] }}</p>
    <p class="cook__sub muted">This usually takes a few seconds.</p>
  </div>
</template>

<style scoped>
.cook {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 34px 20px 30px;
}

.cook__scene {
  position: relative;
  width: 132px;
  height: 104px;
  margin-bottom: 22px;
}

/* ---- pot ---- */

.cook__pot {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  width: 88px;
  height: 54px;
  border-radius: 0 0 22px 22px;
  background: linear-gradient(180deg, #5d4a3d, #3b2c22);
  box-shadow: inset 0 5px 0 rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

/* handles */
.cook__pot::before,
.cook__pot::after {
  content: "";
  position: absolute;
  top: 8px;
  width: 13px;
  height: 8px;
  border: 3px solid #3b2c22;
  border-radius: 3px;
}
.cook__pot::before {
  left: -13px;
}
.cook__pot::after {
  right: -13px;
}

/* ---- soup surface + bubbles ---- */

.cook__bubbles {
  position: absolute;
  inset: 6px 6px auto 6px;
  height: 12px;
  border-radius: 50%;
  background: var(--paprika);
}

.cook__bubbles span {
  position: absolute;
  bottom: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--saffron);
  animation: bubble 1.8s ease-in infinite;
}

.cook__bubbles span:nth-child(1) {
  left: 16%;
  animation-delay: 0s;
}
.cook__bubbles span:nth-child(2) {
  left: 46%;
  width: 9px;
  height: 9px;
  animation-delay: 0.55s;
}
.cook__bubbles span:nth-child(3) {
  left: 72%;
  width: 6px;
  height: 6px;
  animation-delay: 1.1s;
}

@keyframes bubble {
  0% {
    transform: translateY(0) scale(0.5);
    opacity: 0;
  }
  35% {
    opacity: 1;
  }
  100% {
    transform: translateY(-11px) scale(1.1);
    opacity: 0;
  }
}

/* ---- steam ---- */

.cook__steam {
  position: absolute;
  bottom: 62px;
  width: 9px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(180deg, rgba(107, 86, 71, 0), rgba(107, 86, 71, 0.42));
  filter: blur(3px);
  opacity: 0;
  animation: steam 3s ease-out infinite;
}

.cook__steam--a {
  left: 36px;
  animation-delay: 0s;
}
.cook__steam--b {
  left: 60px;
  height: 32px;
  animation-delay: 0.9s;
}
.cook__steam--c {
  left: 84px;
  animation-delay: 1.7s;
}

@keyframes steam {
  0% {
    transform: translateY(6px) scaleX(0.7);
    opacity: 0;
  }
  30% {
    opacity: 0.85;
  }
  100% {
    transform: translateY(-34px) scaleX(1.5);
    opacity: 0;
  }
}

/* ---- hob ---- */

.cook__hob {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 108px;
  height: 9px;
  border-radius: 5px;
  background: var(--line);
}

.cook__hob::after {
  content: "";
  position: absolute;
  inset: 2px 12px;
  border-radius: 4px;
  background: var(--paprika);
  animation: glow 1.6s ease-in-out infinite alternate;
}

@keyframes glow {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}

/* ---- text ---- */

.cook__label {
  margin: 0 0 4px;
  font-family: var(--serif);
  font-size: 1.2rem;
}

.cook__sub {
  margin: 0;
  font-size: 0.86rem;
}

/* someone who asked for less movement still gets the changing messages */
@media (prefers-reduced-motion: reduce) {
  .cook__bubbles span,
  .cook__steam,
  .cook__hob::after {
    animation: none;
  }
  .cook__steam {
    opacity: 0.4;
  }
}
</style>
