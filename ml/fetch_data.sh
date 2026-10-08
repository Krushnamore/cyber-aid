#!/usr/bin/env bash
# Downloads the public training corpora into ml/data (not shipped: ~70 MB)
set -e; mkdir -p data && cd data
curl -sLo sms.tsv      https://raw.githubusercontent.com/justmarkham/pycon-2016-tutorial/master/data/sms.tsv
curl -sLo enron.zip    https://raw.githubusercontent.com/MWiechmann/enron_spam_data/master/enron_spam_data.zip && unzip -oq enron.zip
curl -sLo urls1.csv    https://raw.githubusercontent.com/shreyagopal/Phishing-Website-Detection-by-Machine-Learning-Techniques/master/DataFiles/1.Benign_list_big_final.csv
curl -sLo urls2.csv    https://raw.githubusercontent.com/shreyagopal/Phishing-Website-Detection-by-Machine-Learning-Techniques/master/DataFiles/2.online-valid.csv
curl -sLo phish_urls_now.txt https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-links-ACTIVE.txt
curl -sLo top1m.csv    https://raw.githubusercontent.com/zer0h/top-1000000-domains/master/top-1000000-domains
echo "done"
