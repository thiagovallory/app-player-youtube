import { initCompact } from './compact'
import { initDisplays } from './displays'
import { hydrateIcons } from './icons'
import { initMenu } from './menu'
import { initNotice } from './notice'
import { initPlayback } from './playback'
import { initPrefs } from './prefs'
import { initQueue } from './queue'

hydrateIcons()
initMenu()
initCompact()
initNotice()
void initDisplays()
void initPlayback()
void initQueue()
void initPrefs()
