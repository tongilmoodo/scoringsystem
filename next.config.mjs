import withSerwistInit from '@serwist/next';

/** @type {import('next').NextConfig} */
const nextConfig = {};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
