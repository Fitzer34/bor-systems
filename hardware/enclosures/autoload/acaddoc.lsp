;; Loads the 3D-printed enclosure assembly stages when the flag file LOAD_ME exists next to assemble.scr.
;; With no flag file this does nothing, so ordinary drawings open as usual. The flag is removed from outside AutoCAD.
(defun stages:load-if-flagged ( / flag scr)
  (setq flag "/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v9/stages/LOAD_ME")
  (setq scr  "/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v9/stages/assemble.scr")
  (if (and (findfile flag) (findfile scr))
    (command "_.SCRIPT" scr))
  (princ))
(defun-q stages:startup () (stages:load-if-flagged))
(setq S::STARTUP (append S::STARTUP stages:startup))
(princ)
