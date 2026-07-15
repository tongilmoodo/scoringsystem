import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mombasa Open Scoring System',
    short_name: 'MO Scoring',
    description: 'Live tournament scoring for the Mombasa Open',
    start_url: '/',
    display: 'standalone',
    background_color: '#030712',
    theme_color: '#030712',
    icons: [
      {
        src: '/logo.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
