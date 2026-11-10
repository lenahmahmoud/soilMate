// Public, read-only layer data changes only on deploy, so browsers/CDNs may cache it. ETag comes from Express.
export function publicCache(maxAgeSeconds = 3600) {
  return (req, res, next) => {
    res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    next();
  };
}