# Сторонний код и внешние инструменты

| Что | Лицензия | Где у нас | Как используется |
|---|---|---|---|
| cinetic, product-film-skill, Barty-Bart/motion-graphics, ClaudeAnimationBase | MIT | `src/motion/THIRD-PARTY-LICENSES.md` | перенесённый код (тексты лицензий там) |
| Motion Prompt (showheyohtaki) | MIT | `vendor/motion-prompt/THIRD-PARTY-NOTICES.md`, `VENDORED.md` | вендоренный каталог, закреплённый коммит |
| RobustVideoMatting (PeterL1n) | GPL-3.0 | **вне репо**: каталог `RVM_DIR` (env.manifest.json), код и веса `rvm_resnet50.pth` / `rvm_mobilenetv3.pth` | **внешний инструмент, не распространяется**: `tools/matte/rvm-matte.py` вызывает его через subprocess в его же venv; в репо нет ни строки кода RVM. Запасной движок маски человека (задача 025), основной — Apple Vision (часть macOS) |
