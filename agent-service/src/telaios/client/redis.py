from typing import Dict

import redis

from telaios.config.settings import config


class RedisClient():
    def __init__(self):
        self.client = redis.Redis(host=config.REDIS_HOST, port=config.REDIS_PORT, db=config.REDIS_DB, decode_responses=True,
                     username=config.REDIS_USERNAME, password=config.REDIS_PASSWORD)
        self.connected = False

    def get_instance(self) -> redis.Redis:
        return self.client

    def check_connection(self) -> bool:
        try:
            self.connected = self.client.ping()
        except redis.exceptions.ConnectionError:
            self.connected = False
        return self.connected

client = RedisClient()