```bash
docker run -it --rm \
  --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  -v $(pwd)/jaeger.yml:/etc/jaeger/jaeger.yml \
  jaegertracing/jaeger:2.4.0 \
    --config=/etc/jaeger/jaeger.yml

# open localhost:16686

  -v /etc/jaeger/jaeger.yml:/etc/jaeger/jaeger.yml \
# TODO: set up ufw and block remote access to 16686 and 4318

open https://pto-api.admiraldigital.dev/jaeger
```

```
sudo apt install apache2-utils
sudo htpasswd -c /etc/apache2/.htpasswd DevelopmentStaging
# password is DevelopmentStaging
```

https://pto-members.admiraldigital.dev
