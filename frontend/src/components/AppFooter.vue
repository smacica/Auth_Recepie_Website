<template>
  <footer class="footer">
    <div class="page footer__inner">
      <span>🍅 EatHub — cook something worth sharing.</span>
      <span class="muted">{{ new Date().getFullYear() }}</span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 1px solid var(--line);
  background: var(--cream-deep);
  padding: 24px 0;
  font-size: 0.9rem;
}

.footer__inner {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
