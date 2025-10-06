import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles.css';
import { naive } from './plugins/naive';
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(naive);
app.provide('config-provider', { theme: darkTheme });
app.mount('#app');
