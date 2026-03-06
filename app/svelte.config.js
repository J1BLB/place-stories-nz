import adapter from 'svelte-adapter-azure-swa';
import preprocess from 'svelte-preprocess';

export default {
  preprocess: preprocess(),
  kit: {
    adapter: adapter()
  }
};
