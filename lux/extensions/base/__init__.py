'''The base :ref:`lux extension <extensions>`, it provides several
middleware utilities. If used, it should be the first extension in your
:setting:`EXTENSIONS` list (excluding extensions which
don't provide any wsgi middleware such as :mod:`lux.extensions.sitemap`
for example).


Parameters
================

.. lux_extension:: lux.extensions.base


Media Handling
======================
When the :setting:`SERVE_STATIC_FILES` parameter is set to ``True``,
this extension adds middleware for serving static files from
:setting:`MEDIA_URL`.
In addition, a :setting:`FAVICON` location can also be specified.


API
=========

API Extension
~~~~~~~~~~~~~~~~~~~~~

.. autoclass:: Extension
   :members:
   :member-order: bysource


Scripts
~~~~~~~~~~~~~~~~~~~~~

.. autoclass:: Scripts
   :members:
   :member-order: bysource
'''
import os
import hashlib

from pulsar.apps import wsgi
from pulsar.utils.html import mark_safe

import lux
from lux import Parameter

from .media import FileRouter, MediaRouter


class Extension(lux.Extension):
    _config = [
        Parameter('GZIP_MIN_LENGTH', 200,
                  'If a positive integer, a response middleware is added so '
                  'that it encodes the response via the gzip algorithm.'),
        Parameter('USE_ETAGS', False, ''),
        Parameter('CLEAN_URL', True,
                  'When ``True``, requests on url with consecutive slashes '
                  'are converted to valid url and redirected.'),
        Parameter('SERVE_STATIC_FILES', False,
                  'if ``True`` add middleware to serve static files.'),
        Parameter('FAVICON', None,
                  'Adds wsgi middleware to handle favicon url ``/favicon.ico``'
                  'served from ``MEDIA_URL/FAVICON``')]

    def middleware(self, app):
        '''Add two middleware handlers if configured to do so.'''
        middleware = []
        if app.config['CLEAN_URL']:
            middleware.append(wsgi.clean_path_middleware)
        if app.config['SERVE_STATIC_FILES']:
            icon = app.config['FAVICON']
            if icon:
                middleware.append(FileRouter('/favicon.ico', icon))
            path = app.config['MEDIA_URL']
            # Check if node modules are available
            node_modules = os.path.join(os.path.dirname(app.meta.path),
                                        'node_modules')
            if os.path.isdir(node_modules):
                node = '%snode_modules/' % path
                middleware.append(wsgi.MediaRouter(node, node_modules,
                                                   show_indexes=app.debug))
            middleware.append(MediaRouter(path, app.meta.media_dir,
                                          show_indexes=app.debug))
        return middleware

    def response_middleware(self, app):
        gzip = app.config['GZIP_MIN_LENGTH']
        middleware = []
        if gzip:
            middleware.append(wsgi.GZipMiddleware(gzip))
        if app.config['USE_ETAGS']:
            middleware.append(self.etag)
        return middleware

    def etag(self, environ, response):
        if response.has_header('ETag'):
            etag = response['ETag']
        elif response.streaming:
            etag = None
        else:
            etag = '"%s"' % hashlib.md5(response.content).hexdigest()
        if etag is not None:
            if (200 <= response.status_code < 300
                    and environ.get('HTTP_IF_NONE_MATCH') == etag):
                response.not_modified()
            else:
                response['ETag'] = etag
        return response
