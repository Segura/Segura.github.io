#!/bin/bash

git submodule update --init --recursive

cd ./telegram-contests-js-2019
git pull
npm i
npm run build

cp ./build/bundle.min.css ../
cp ./build/bundle.min.js ../
cp ./demo/graph.css ../
cp ./demo/chart_data.json ../
cp ./demo/themes.css ../
