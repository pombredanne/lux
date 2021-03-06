from lux.utils import test
from lux.extensions.ui.lib import *

from . import vars


class TestMedia(vars.TestCase):

    def test_skin(self):
        all = Css(vars=self.all().variables)
        css = all.css
        css('body',
            Media('only screen and (max-width: 760px)')
            .css('.bla',
                 Skin('tr:nth')))
        txt = all.render()
        self.assertTrue('tr:nth' in txt)
