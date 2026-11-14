"""List local Home Assistant media images for Vega Lock without exposing file contents.

Input is a directory, never an image URL. Only Home Assistant configured media roots
can be read. The browser requests signed individual URLs through HA auth/sign_path.
"""
from pathlib import Path
from urllib.parse import quote

MAX_IMAGES = 500
MAX_DEPTH = 5
IMAGE_EXTENSIONS = frozenset({'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'})


class InvalidMediaFolder(ValueError):
    """Unsafe or unsupported local media directory."""


def configured_roots(media_dirs):
    """Use HA's configured media roots, or its standard /media root."""
    return {str(name): Path(path).resolve() for name, path in
            (media_dirs or {'local': '/media'}).items() if str(name).strip()}


def resolve_media_folder(value: str, media_dirs):
    """Return (configured media root key, root, target) for a helper path.

    Supported inputs: /media/wallpaper/japan, /media/local/wallpaper/japan,
    media-source://media_source/local/wallpaper/japan. Never accepts a URL
    pointing to a remote host, encoded traversals, or arbitrary filesystem roots.
    """
    if not isinstance(value, str) or not (folder := value.strip()) or len(folder) > 1024:
        raise InvalidMediaFolder('Missing media folder')
    if any(char in folder for char in ('\\', '\x00', '?', '#')):
        raise InvalidMediaFolder('Invalid media folder characters')
    if folder.startswith('media-source://media_source/'):
        remainder = folder[len('media-source://media_source/'):]
        if not remainder.startswith('local/'):
            raise InvalidMediaFolder('Only local media source folders are supported')
        folder = '/media/local/' + remainder[len('local/'):]
    if not folder.startswith('/media/'):
        raise InvalidMediaFolder('Folder must be under /media')
    raw_parts = folder[len('/media/'):].split('/')
    if any(not part or part in {'.', '..'} or '%' in part or '\\' in part
           for part in raw_parts):
        raise InvalidMediaFolder('Unsafe media folder path')
    roots = configured_roots(media_dirs)
    # The /media/local prefix identifies the standard media-source alias, not
    # a literal subdirectory. Other configured aliases can be used likewise.
    if raw_parts[0] in roots:
        name = raw_parts[0]
        relative = raw_parts[1:]
    else:
        # Absolute /media/foo mapping to HA's selected directory root.
        # Prefer a root physically located at /media rather than guessing 'local'.
        candidates = [(name, root) for name, root in roots.items()
                      if root == Path('/media')]
        if not candidates:
            raise InvalidMediaFolder('Home Assistant /media is not configured')
        name, _ = next(((key, root) for key, root in candidates if key == 'local'), candidates[0])
        relative = raw_parts
    if not relative:
        raise InvalidMediaFolder('Choose a folder below /media')
    root = roots[name]
    target = root.joinpath(*relative).resolve()
    if not target.is_relative_to(root):
        raise InvalidMediaFolder('Folder is outside the media directory')
    return name, root, target


def list_media_photos(folder: str, media_dirs):
    """Safely scan, return browser paths (not absolute disk paths)."""
    name, root, target = resolve_media_folder(folder, media_dirs)
    if not target.is_dir():
        raise InvalidMediaFolder('Media folder not found')
    results = []
    stack = [(target, 0)]
    while stack and len(results) < MAX_IMAGES:
        current, depth = stack.pop()
        try:
            children = sorted(current.iterdir(), key=lambda p: p.name.casefold())
        except OSError as exc:
            raise InvalidMediaFolder('Cannot read media folder') from exc
        for entry in children:
            if len(results) >= MAX_IMAGES:
                break
            if entry.name.startswith('.') or entry.is_symlink():
                continue
            try:
                if entry.is_dir() and depth < MAX_DEPTH:
                    stack.append((entry, depth + 1))
                elif entry.is_file() and entry.suffix.lower() in IMAGE_EXTENSIONS:
                    relative = entry.relative_to(root).parts
                    results.append('/media/' + quote(name, safe='') + '/' +
                                   '/'.join(quote(p, safe='') for p in relative))
            except OSError:
                continue
    return results
