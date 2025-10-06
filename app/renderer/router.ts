import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'recordings',
    component: () => import('./views/RecordingsView.vue'),
  },
  {
    path: '/recordings/:id',
    name: 'recording-editor',
    component: () => import('./views/RecordingEditorView.vue'),
  },
  {
    path: '/blocks',
    name: 'blocks',
    component: () => import('./views/BlocksLibraryView.vue'),
  },
  {
    path: '/api',
    name: 'api-console',
    component: () => import('./views/ApiConsoleView.vue'),
  },
  {
    path: '/composer',
    name: 'composer',
    component: () => import('./views/TestComposerView.vue'),
  },
  {
    path: '/tests/flow',
    name: 'tests-flow',
    component: () => import('./views/TestCaseFlowView.vue'),
  },
  {
    path: '/datasets',
    name: 'datasets',
    component: () => import('./views/DatasetsView.vue'),
  },
  {
    path: '/suites',
    name: 'suites',
    component: () => import('./views/SuitesView.vue'),
  },
  {
    path: '/runner',
    name: 'runner',
    component: () => import('./views/TestRunnerView.vue'),
  },
  {
    path: '/settings/llm',
    name: 'settings-llm',
    component: () => import('./views/LLMSettingsView.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
