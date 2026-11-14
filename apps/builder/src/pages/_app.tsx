import type { AppProps } from 'next/app'

import '@/styles.css'

class App {
  static render({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />
  }
}

export default App.render
