import { initDisplays } from './displays'
import { hydrateIcons } from './icons'
import { initMenu } from './menu'
import { initNotice } from './notice'
import { initPlayback } from './playback'
import { initQueue } from './queue'

hydrateIcons()
initMenu()
initNotice()
void initDisplays()
void initPlayback()
void initQueue()
