#!/bin/zsh
# audition.sh                play every rendered finish sound, one after another
# audition.sh research base  play just these
cd "${0:A:h}/clips" || exit 1
ids=("$@"); [[ $# -eq 0 ]] && ids=(${(f)"$(ls *.voice.m4a | sed 's/.voice.m4a//')"})
for id in $ids; do print -r -- "$id"; afplay -v 0.8 $id.chime.m4a; afplay -v 0.8 $id.voice.m4a; sleep 0.6; done
